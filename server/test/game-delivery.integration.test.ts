import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GameCommand } from '@frontier-isles/game-core/contracts/commands'
import type { TileId, TradeId } from '@frontier-isles/game-core/model/ids'
import { createEmptyResourceBag } from '@frontier-isles/game-core/model/resource'
import { assertTradingState } from '@frontier-isles/game-core/engine/trading-invariants'
import { PersonalityAiAgent } from '@frontier-isles/game-ai/personality-ai-agent'
import {
  REALTIME_PROTOCOL_VERSION, gameCommandAcknowledgementSchema, gameCommandRequestSchema,
  sessionResumeAcknowledgementSchema, roomCreateAcknowledgementSchema, roomJoinAcknowledgementSchema,
  gameRequestSnapshotAcknowledgementSchema, type GameCommandRequest, type GameUpdate,
} from '@frontier-isles/realtime-contracts'
import { actionFixture, requireValue, successData } from './game-test-helpers.js'
import { networkGame, networkSnapshot, startNetworkGame, type GameClient, type NetworkGame } from './game-network-helpers.js'
import { workflowFixture } from './online-workflow-fixtures.js'

const networks: NetworkGame[] = []
const empty = createEmptyResourceBag()
let sequence = 0
function deferred(): { readonly promise: Promise<void>; readonly resolve: () => void } {
  let resolve: () => void = () => { throw new Error('Deferred must be initialized synchronously.') }
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}
function request(view: GameUpdate, command: GameCommand): GameCommandRequest {
  return gameCommandRequestSchema.parse({ protocolVersion: REALTIME_PROTOCOL_VERSION,
    roomCode: view.roomCode, gameId: view.gameId, expectedStateVersion: view.view.stateVersion,
    commandId: `human:delivery-network:${sequence++}`, command })
}
async function deliver(client: GameClient, command: GameCommandRequest): Promise<ReturnType<typeof gameCommandAcknowledgementSchema.parse>> {
  return gameCommandAcknowledgementSchema.parse(await client.timeout(5_000).emitWithAck('game:command', command))
}
afterEach(async () => { for (const network of networks.splice(0)) await network.close() })

describe('delivery serialization through actual Socket.IO connections', () => {
  it('serializes same-session and current/non-current requests without a second purchase', async () => {
    const transitions = vi.fn(assertTradingState)
    const network = await networkGame(4, { createState: actionFixture, afterTransition: transitions })
    networks.push(network)
    await startNetworkGame(network)
    const host = requireValue(network.clients[0])
    const other = requireValue(network.clients[1])
    const before = await networkSnapshot(network, host)
    const first = request(before, { type: 'BUY_DEVELOPMENT_CARD' })
    const second = request(before, { type: 'BUY_DEVELOPMENT_CARD' })
    const invalid = request(before, { type: 'END_TURN' })
    const results = await Promise.all([deliver(host, first), deliver(host, second), deliver(other, invalid), deliver(host, first)])
    expect(results[0]).toMatchObject({ ok: true, data: { accepted: true } })
    expect(results[3]).toEqual(results[0])
    expect(results[1]).toMatchObject({ ok: true, data: { accepted: false, violation: { code: 'STALE_STATE_VERSION' } } })
    expect(results[2]).toMatchObject({ ok: true, data: { accepted: false } })
    expect(transitions).toHaveBeenCalledTimes(1)
    expect((await networkSnapshot(network, host)).view.self.developmentCards).toHaveLength(before.view.self.developmentCards.length + 1)
  })

  it('accepts only the eligible trade responder under simultaneous accept and replay requests', async () => {
    const transitions = vi.fn(assertTradingState)
    const network = await networkGame(4, { createState: actionFixture, afterTransition: transitions })
    networks.push(network)
    await startNetworkGame(network)
    const host = requireValue(network.clients[0])
    const east = requireValue(network.clients[1])
    const south = requireValue(network.clients[2])
    const before = await networkSnapshot(network, host)
    const eastBefore = await networkSnapshot(network, east)
    const tradeId = 'trade:concurrent-network' as TradeId
    expect(successData(await deliver(host, request(before, { type: 'PROPOSE_TRADE', offer: {
      tradeId, initiatorId: before.view.self.id, proposedById: before.view.self.id,
      counterpartyId: eastBefore.view.self.id, parentTradeId: null,
      initiatorGives: { ...empty, LUMBER: 1 }, counterpartyGives: { ...empty, BRICK: 1 },
    } }))).accepted).toBe(true)
    const pending = await networkSnapshot(network, east)
    const accepted = request(pending, { type: 'ACCEPT_TRADE', tradeId })
    const invalid = request(pending, { type: 'ACCEPT_TRADE', tradeId })
    const results = await Promise.all([deliver(east, accepted), deliver(south, invalid), deliver(east, accepted)])
    expect(results[0]).toMatchObject({ ok: true, data: { accepted: true } })
    expect(results[1]).toMatchObject({ ok: true, data: { accepted: false } })
    expect(results[2]).toEqual(results[0])
    expect(transitions).toHaveBeenCalledTimes(2)
    const after = await networkSnapshot(network, east)
    expect(after.view.pendingDecision).toBeNull()
    expect(after.view.self.resources).toEqual({ ...eastBefore.view.self.resources,
      LUMBER: eastBefore.view.self.resources.LUMBER + 1, BRICK: eastBefore.view.self.resources.BRICK - 1 })
    expect((await networkSnapshot(network, host)).view.publicGame.bank).toEqual(before.view.publicGame.bank)
  })

  it.each(['TRADE', 'DISCARD', 'ROBBER'] as const)('preserves a pending %s across resume and executes its saved request once', async (decision) => {
    const scenario = decision === 'TRADE' ? 'BUILD_TRADE' : decision === 'DISCARD' ? 'SEVEN' : 'KNIGHT'
    const transitions = vi.fn(assertTradingState)
    const network = await networkGame(4, { createState: (config) => workflowFixture(scenario, config), afterTransition: transitions })
    networks.push(network)
    await startNetworkGame(network)
    const host = requireValue(network.clients[0])
    const initial = await networkSnapshot(network, host)
    const tradeId = 'trade:resume-network' as TradeId
    const actorIndex = decision === 'TRADE' ? 1 : 0
    if (decision === 'TRADE') {
      const east = await networkSnapshot(network, requireValue(network.clients[1]))
      expect(successData(await deliver(host, request(initial, { type: 'PROPOSE_TRADE', offer: {
        tradeId, initiatorId: initial.view.self.id, proposedById: initial.view.self.id,
        counterpartyId: east.view.self.id, parentTradeId: null,
        initiatorGives: { ...empty, LUMBER: 1 }, counterpartyGives: { ...empty, BRICK: 1 },
      } }))).accepted).toBe(true)
    } else expect(successData(await deliver(host, request(initial, decision === 'DISCARD' ? { type: 'ROLL_DICE' }
      : { type: 'PLAY_DEVELOPMENT_CARD', cardId: requireValue(initial.view.legalActions.playableDevelopmentCardIds[0]) }))).accepted).toBe(true)
    const old = requireValue(network.clients[actorIndex])
    const before = await networkSnapshot(network, old)
    const saved = request(before, decision === 'TRADE' ? { type: 'ACCEPT_TRADE', tradeId }
      : decision === 'DISCARD' ? { type: 'DISCARD_RESOURCES', resources: { ...empty, LUMBER: 4 } }
        : { type: 'MOVE_ROBBER', tileId: 'tile:-2,2' as TileId })
    const member = requireValue(network.members[actorIndex])
    old.disconnect()
    await vi.waitFor(() => expect(network.snapshot().seats[actorIndex]).toMatchObject({ connectionStatus: 'RECONNECTING' }))
    const resumed = await network.connect()
    const restored = successData(sessionResumeAcknowledgementSchema.parse(await resumed.timeout(5_000).emitWithAck('session:resume', member.credential)))
    expect(restored.credential).toEqual(member.credential)
    expect((await networkSnapshot(network, resumed)).view).toEqual(before.view)
    const count = transitions.mock.calls.length
    const result = await deliver(resumed, saved)
    expect(successData(result).accepted).toBe(true)
    const after = await networkSnapshot(network, resumed)
    expect(await deliver(resumed, saved)).toEqual(result)
    expect(await networkSnapshot(network, resumed)).toEqual(after)
    expect(transitions).toHaveBeenCalledTimes(count + 1)
  })

  it('lets a second Room on the same server advance while AI is held, then rejects queued replaced-socket authority', async () => {
    const gate = deferred()
    const entered = deferred()
    const agent = new PersonalityAiAgent()
    let roomNumber = 0
    let held = false
    const network = await networkGame(2, { createState: (config, seed) => {
      const state = actionFixture(config, seed)
      return roomNumber++ === 0 ? { ...state, turn: { ...state.turn, currentPlayerId: config.players[2].id } } : state
    }, aiAgent: { chooseNextCommand: async (view, context) => {
      if (!held) { held = true; entered.resolve(); await gate.promise }
      return agent.chooseNextCommand(view, context)
    } } })
    networks.push(network)
    try {
      const host = requireValue(network.clients[0])
      successData(await host.timeout(5_000).emitWithAck('room:start', { protocolVersion: REALTIME_PROTOCOL_VERSION,
        expectedRevision: network.snapshot().revision }))
      await entered.promise
      const submit = vi.spyOn(network.service, 'submitGameCommand')
      const before = await networkSnapshot(network, host)
      const oldRequest = request(before, { type: 'END_TURN' })
      const oldDelivery = deliver(host, oldRequest).catch(() => null)
      await vi.waitFor(() => expect(submit).toHaveBeenCalledTimes(1))
      const queuedAtServer = requireValue(submit.mock.results[0]).value as ReturnType<NetworkGame['service']['submitGameCommand']>

      const secondHost = await network.connect()
      const secondJoiner = await network.connect()
      const created = successData(roomCreateAcknowledgementSchema.parse(await secondHost.timeout(5_000).emitWithAck('room:create', {
        protocolVersion: REALTIME_PROTOCOL_VERSION, displayName: 'Other Host' })))
      successData(roomJoinAcknowledgementSchema.parse(await secondJoiner.timeout(5_000).emitWithAck('room:join', {
        protocolVersion: REALTIME_PROTOCOL_VERSION, roomCode: created.snapshot.roomCode, displayName: 'Other Human' })))
      const secondRoom = (): NonNullable<ReturnType<NetworkGame['service']['getSnapshot']>> => requireValue(network.service.getSnapshot(created.snapshot.roomCode))
      for (const seat of secondRoom().seats) if (seat.occupancy === 'EMPTY') successData(await secondHost.timeout(5_000).emitWithAck('room:set-ai-seat', {
        protocolVersion: REALTIME_PROTOCOL_VERSION, expectedRevision: secondRoom().revision, seatId: seat.seatId, profileId: 'BUILDER' }))
      for (const client of [secondHost, secondJoiner]) successData(await client.timeout(5_000).emitWithAck('room:set-ready', {
        protocolVersion: REALTIME_PROTOCOL_VERSION, expectedRevision: secondRoom().revision, ready: true }))
      successData(await secondHost.timeout(5_000).emitWithAck('room:start', { protocolVersion: REALTIME_PROTOCOL_VERSION, expectedRevision: secondRoom().revision }))
      const secondView = successData(gameRequestSnapshotAcknowledgementSchema.parse(await secondHost.timeout(5_000).emitWithAck('game:request-snapshot', {
        protocolVersion: REALTIME_PROTOCOL_VERSION, roomCode: secondRoom().roomCode, gameId: requireValue(secondRoom().gameId) })))
      expect(successData(await deliver(secondHost, request(secondView, { type: 'BUY_DEVELOPMENT_CARD' }))).accepted).toBe(true)
      expect((await networkSnapshot(network, host)).view.stateVersion).toBe(before.view.stateVersion)

      const replacement = await network.connect()
      successData(sessionResumeAcknowledgementSchema.parse(await replacement.timeout(5_000).emitWithAck('session:resume', requireValue(network.members[0]).credential)))
      gate.resolve()
      expect(await queuedAtServer).toMatchObject({ ok: false, error: { code: 'NOT_ROOM_MEMBER' } })
      await oldDelivery
      const fresh = await networkSnapshot(network, replacement)
      expect(fresh.view.self.id).toBe(before.view.self.id)
      expect(fresh.view.stateVersion).toBeGreaterThan(before.view.stateVersion)
      expect(fresh.lifecycleStatus).toBe('ACTIVE')
    } finally { gate.resolve() }
  })
})
