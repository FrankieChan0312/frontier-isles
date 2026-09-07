import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PlayerView } from '@frontier-isles/game-core/contracts/views'
import type { GameState } from '@frontier-isles/game-core/model/game-state'
import { PersonalityAiAgent } from '@frontier-isles/game-ai/personality-ai-agent'
import { REALTIME_PROTOCOL_VERSION, gameCommandRequestSchema, gameIdSchema, roomReplaceHumanAcknowledgementSchema,
  sessionResumeAcknowledgementSchema, type RoomReplaceHumanRequest } from '@frontier-isles/realtime-contracts'
import { networkGame, networkSnapshot, startNetworkGame, type NetworkGame } from './game-network-helpers.js'
import { actionFixture, requireValue, successData } from './game-test-helpers.js'
import { workflowFixture } from './online-workflow-fixtures.js'

const networks: NetworkGame[] = []
afterEach(async () => { for (const network of networks.splice(0)) await network.close() })
describe('active-game replacement through actual sockets', () => {
  it('rejects non-Host, spoofed, stale and wrong-game replacement intents before an authorized takeover', async () => {
    const network = await networkGame(4, { createState: actionFixture })
    networks.push(network)
    await startNetworkGame(network)
    const host = requireValue(network.clients[0])
    const other = requireValue(network.clients[2])
    const old = requireValue(network.members[1]).credential
    const before = await networkSnapshot(network, host)
    requireValue(network.clients[1]).disconnect()
    await vi.waitFor(() => expect(network.snapshot().seats[1]).toMatchObject({ connectionStatus: 'RECONNECTING' }))
    network.runtime.advanceBy(30_000)
    const request: RoomReplaceHumanRequest = { protocolVersion: REALTIME_PROTOCOL_VERSION, gameId: before.gameId,
      expectedRevision: network.snapshot().revision, seatId: 'EAST', profileId: 'BUILDER' }
    expect(await other.timeout(5_000).emitWithAck('room:replace-human', request)).toMatchObject({ ok: false, error: { code: 'NOT_HOST' } })
    const close = { protocolVersion: request.protocolVersion, gameId: request.gameId, expectedRevision: request.expectedRevision }
    expect(await other.timeout(5_000).emitWithAck('room:close-game', close)).toMatchObject({ ok: false, error: { code: 'NOT_HOST' } })
    expect(await host.timeout(5_000).emitWithAck('room:replace-human', { ...request, gameId: gameIdSchema.parse('game:wrong') }))
      .toMatchObject({ ok: false, error: { code: 'GAME_NOT_FOUND' } })
    const spoofed = { ...request, host: true } as RoomReplaceHumanRequest
    expect(await host.timeout(5_000).emitWithAck('room:replace-human', spoofed)).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } })
    expect(await host.timeout(5_000).emitWithAck('room:replace-human', { ...request, expectedRevision: before.publicationRevision as RoomReplaceHumanRequest['expectedRevision'] }))
      .toMatchObject({ ok: false, error: { code: 'REVISION_CONFLICT' } })
    successData(roomReplaceHumanAcknowledgementSchema.parse(await host.timeout(5_000).emitWithAck('room:replace-human', request)))
    const after = await networkSnapshot(network, host)
    expect(after.view.publicGame).toEqual(before.view.publicGame)
    expect(after.view.opponents.find((player) => player.id === `player:${network.snapshot().roomCode}:EAST`)?.controller).toEqual({ type: 'AI', profileId: 'BUILDER' })
    const oldTransport = await network.connect()
    expect(sessionResumeAcknowledgementSchema.parse(await oldTransport.timeout(5_000).emitWithAck('session:resume', old)))
      .toMatchObject({ ok: false, error: { code: 'SESSION_INVALID' } })
    expect(await oldTransport.timeout(5_000).emitWithAck('game:command', gameCommandRequestSchema.parse({
      protocolVersion: REALTIME_PROTOCOL_VERSION, roomCode: before.roomCode, gameId: before.gameId,
      commandId: 'human:expired-seat', expectedStateVersion: before.view.stateVersion, command: { type: 'END_TURN' },
    }))).toMatchObject({ ok: false, error: { code: 'NOT_ROOM_MEMBER' } })
  })

  it('replaces a Human in a private discard with the same PlayerId and advances only that redacted AI decision', async () => {
    let state: GameState | null = null
    const views: PlayerView[] = []
    const agent = new PersonalityAiAgent()
    const network = await networkGame(2, { createState: (config) => {
      state = workflowFixture('SEVEN', config)
      return state
    }, afterTransition: (next) => { state = next }, aiAgent: { chooseNextCommand: async (view, context) => {
      views.push(view)
      return agent.chooseNextCommand(view, context)
    } } })
    networks.push(network)
    await startNetworkGame(network)
    const north = requireValue(network.clients[0])
    const east = requireValue(network.clients[1])
    const initial = await networkSnapshot(network, north)
    successData(await north.timeout(5_000).emitWithAck('game:command', gameCommandRequestSchema.parse({
      protocolVersion: REALTIME_PROTOCOL_VERSION, roomCode: initial.roomCode, gameId: initial.gameId,
      commandId: 'human:presence-seven', expectedStateVersion: initial.view.stateVersion, command: { type: 'ROLL_DICE' },
    })))
    const before: GameState = requireValue<GameState>(state)
    const playerId = (await networkSnapshot(network, north)).view.self.id
    north.disconnect()
    await vi.waitFor(() => expect(network.snapshot().seats[0]).toMatchObject({ connectionStatus: 'RECONNECTING' }))
    network.runtime.advanceBy(30_000)
    expect(network.snapshot().hostSeatId).toBe('EAST')
    expect(state).toBe(before)
    successData(roomReplaceHumanAcknowledgementSchema.parse(await east.timeout(5_000).emitWithAck('room:replace-human', {
      protocolVersion: REALTIME_PROTOCOL_VERSION, gameId: initial.gameId, expectedRevision: network.snapshot().revision,
      seatId: 'NORTH', profileId: 'MERCHANT',
    })))
    const after: GameState = requireValue<GameState>(state)
    expect(views).toHaveLength(1)
    expect(views[0]?.self.id).toBe(playerId)
    expect(views[0]?.pendingDecision).toEqual({ type: 'DISCARD_RESOURCES', requiredCount: 4 })
    expect(views[0]?.opponents.every((player) => !('resources' in player) && !('developmentCards' in player))).toBe(true)
    expect(after.random).toEqual(before.random)
    expect(after.stateVersion).toBe(before.stateVersion + 1)
    const observer = await networkSnapshot(network, east)
    expect(observer.view.pendingDecision).toEqual({ type: 'DISCARD_RESOURCES', requiredCount: 4 })
    expect(network.updates[1]?.flatMap((update) => update.events)).toContainEqual({ type: 'RESOURCES_DISCARDED', playerId, quantity: 4, resources: null })
    expect(observer.presence.lifecycleStatus).toBe('ACTIVE')
  })
})
