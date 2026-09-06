import { afterEach, describe, expect, it } from 'vitest'
import type { GameCommand } from '@frontier-isles/game-core/contracts/commands'
import {
  REALTIME_PROTOCOL_VERSION, gameCommandRequestSchema, gameIdSchema, gameUpdateSchema,
  gameCommandAcknowledgementSchema, sessionResumeAcknowledgementSchema, type GameCommandResult,
  type GameCommandRequest,
} from '@frontier-isles/realtime-contracts'
import { actionFixture, requireValue, successData } from './game-test-helpers.js'
import { networkGame, networkSnapshot, startNetworkGame, type NetworkGame } from './game-network-helpers.js'

const networks: NetworkGame[] = []
function commandData(payload: unknown): GameCommandResult {
  return successData(gameCommandAcknowledgementSchema.parse(payload))
}
afterEach(async () => { for (const network of networks.splice(0)) await network.close() })

describe('real online Socket.IO authority and publication', () => {
  it('returns a safe error without publishing exception details or changing state on an internal failure', async () => {
    const network = await networkGame(2, { createState: actionFixture,
      afterTransition: () => { throw new Error('SECRET internal state and stack') } })
    networks.push(network)
    await startNetworkGame(network)
    const host = requireValue(network.clients[0])
    const before = await networkSnapshot(network, host)
    const request = gameCommandRequestSchema.parse({ protocolVersion: REALTIME_PROTOCOL_VERSION,
      roomCode: before.roomCode, gameId: before.gameId, commandId: 'human:internal-error',
      expectedStateVersion: before.view.stateVersion, command: { type: 'BUY_DEVELOPMENT_CARD' } })
    const rejected: unknown = await host.timeout(5_000).emitWithAck('game:command', request)
    expect(gameCommandAcknowledgementSchema.parse(rejected)).toEqual({ ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'The server could not complete the request.' } })
    expect((await networkSnapshot(network, host)).view).toEqual(before.view)
    expect(JSON.stringify(network.updates).includes('SECRET')).toBe(false)
  })

  it('starts one game, injects actors, caches outcomes, rejects spoofing/staleness and restores current authority on resume', async () => {
    const network = await networkGame(2, { createState: actionFixture })
    networks.push(network)
    const host = requireValue(network.clients[0])
    const joiner = requireValue(network.clients[1])
    await startNetworkGame(network)
    const hostView = await networkSnapshot(network, host)
    const joinerView = await networkSnapshot(network, joiner)
    expect(hostView.view.publicGame).toEqual(joinerView.view.publicGame)
    expect(hostView.view.self.id).not.toBe(joinerView.view.self.id)
    const command = gameCommandRequestSchema.parse({ protocolVersion: REALTIME_PROTOCOL_VERSION,
      roomCode: network.snapshot().roomCode, gameId: hostView.gameId, commandId: 'human:network:buy',
      expectedStateVersion: hostView.view.stateVersion, command: { type: 'BUY_DEVELOPMENT_CARD' } })
    const delivered = Promise.all(network.clients.map((client) => new Promise<void>((resolve) => {
      const onUpdate = (untrusted: unknown): void => {
        const update = gameUpdateSchema.parse(untrusted)
        if (update.view.stateVersion === 17) {
          client.off('game:update', onUpdate)
          resolve()
        }
      }
      client.on('game:update', onUpdate)
    })))
    const spoofed = { ...command, actorId: joinerView.view.self.id } as GameCommandRequest
    expect(await host.timeout(5_000).emitWithAck('game:command', spoofed))
      .toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } })
    expect((await networkSnapshot(network, host)).view.stateVersion).toBe(hostView.view.stateVersion)
    const accepted = await host.timeout(5_000).emitWithAck('game:command', command)
    expect(accepted).toMatchObject({ ok: true, data: { accepted: true, stateVersion: 17 } })
    await delivered
    // Test publication itself before any snapshot request can mask a dropped update.
    expect(network.updates.every((updates) => updates.some((update) => update.view.stateVersion === 17))).toBe(true)
    const recovery = JSON.stringify(network.recoveryPackets())
    expect(recovery.includes('game:update')).toBe(false)
    expect(recovery.includes('developmentCards')).toBe(false)
    expect(await host.timeout(5_000).emitWithAck('game:command', command)).toEqual(accepted)
    expect((await networkSnapshot(network, host)).view.stateVersion).toBe(17)
    const rejected = await joiner.timeout(5_000).emitWithAck('game:command', { ...command,
      commandId: gameCommandRequestSchema.parse({ ...command, commandId: 'human:joiner:1' }).commandId,
      expectedStateVersion: 17, command: { type: 'END_TURN' } })
    expect(rejected).toMatchObject({ ok: true, data: { accepted: false, violation: { code: 'NOT_YOUR_TURN' } } })
    const stale = await host.timeout(5_000).emitWithAck('game:command', { ...command,
      commandId: gameCommandRequestSchema.parse({ ...command, commandId: 'human:stale:1' }).commandId })
    expect(stale).toMatchObject({ ok: true, data: { accepted: false, violation: { code: 'STALE_STATE_VERSION' } } })
    expect(JSON.stringify([accepted, rejected, stale])).not.toMatch(/resources|cardType|details|random|stack/u)
    const stranger = await network.connect()
    expect(await stranger.timeout(5_000).emitWithAck('game:command', command))
      .toMatchObject({ ok: false, error: { code: 'NOT_ROOM_MEMBER' } })
    expect(await host.timeout(5_000).emitWithAck('game:command', { ...command, gameId: gameIdSchema.parse('game:wrong') }))
      .toMatchObject({ ok: false, error: { code: 'GAME_NOT_FOUND' } })

    const replaced = new Promise<void>((resolve) => host.once('session:replaced', () => resolve()))
    const disconnected = new Promise<void>((resolve) => host.once('disconnect', () => resolve()))
    const newHost = await network.connect()
    const credential = requireValue(network.members[0]).credential
    const resumed = successData(sessionResumeAcknowledgementSchema.parse(await newHost.timeout(5_000).emitWithAck('session:resume', credential)))
    await Promise.all([replaced, disconnected])
    expect(resumed.credential).toEqual(credential)
    expect(host.connected).toBe(false)
    expect((await networkSnapshot(network, newHost)).view.stateVersion).toBe(17)
    const receivedBefore = network.updates[0]?.length
    const postResume = gameCommandRequestSchema.parse({ ...command, commandId: 'human:new-tab:1',
      expectedStateVersion: 17, command: { type: 'BUY_DEVELOPMENT_CARD' } })
    expect(commandData(await newHost.timeout(5_000).emitWithAck('game:command', postResume)).accepted).toBe(true)
    expect((await networkSnapshot(network, newHost)).view.stateVersion).toBe(18)
    expect(network.updates[0]?.length).toBe(receivedBefore)
    const oldHello = new Promise<void>((resolve) => host.once('server:hello', () => resolve()))
    host.connect()
    await oldHello
    expect(await host.timeout(5_000).emitWithAck('game:command', command))
      .toMatchObject({ ok: false, error: { code: 'NOT_ROOM_MEMBER' } })

    for (const [index, updates] of network.updates.entries()) {
      const ownId = index === 0 ? hostView.view.self.id : joinerView.view.self.id
      expect(updates.length).toBeGreaterThan(0)
      for (const update of updates) {
        expect(gameUpdateSchema.safeParse(update).success).toBe(true)
        expect(update.view.self.id).toBe(ownId)
        expect(update.view.opponents.every((opponent) => !('resources' in opponent) && !('developmentCards' in opponent))).toBe(true)
        if (index === 1) {
          for (const event of update.events) if (event.type === 'DEVELOPMENT_CARD_BOUGHT') {
            expect(event.cardId).toBeNull()
            expect(event.cardType).toBeNull()
          }
        }
        expect(JSON.stringify(update)).not.toMatch(/"random"|"seed"|"developmentDeck"|"players"|resumeToken|sessionId|tokenDigest/u)
      }
    }
  })

  it('plays the full initial snake through Human network commands and server AI, then synchronizes a normal roll', async () => {
    const network = await networkGame()
    networks.push(network)
    await startNetworkGame(network)
    for (let index = 0; index < 16; index += 1) {
      const views = await Promise.all(network.clients.map((client) => networkSnapshot(network, client)))
      const first = requireValue(views[0])
      if (first.view.publicGame.turn.setup === null) break
      const actorIndex = views.findIndex((update) => update.view.self.id === first.view.publicGame.turn.currentPlayerId)
      const actor = requireValue(network.clients[actorIndex])
      const view = requireValue(views[actorIndex]).view
      const command: GameCommand = view.publicGame.turn.phase === 'SETUP_SETTLEMENT'
        ? { type: 'PLACE_INITIAL_SETTLEMENT', vertexId: requireValue(view.legalActions.legalInitialSettlementVertexIds?.[0]) }
        : { type: 'PLACE_INITIAL_ROAD', edgeId: requireValue(view.legalActions.legalInitialRoadEdgeIds?.[0]) }
      expect(commandData(await actor.timeout(5_000).emitWithAck('game:command', gameCommandRequestSchema.parse({
        protocolVersion: REALTIME_PROTOCOL_VERSION, roomCode: first.roomCode, gameId: first.gameId,
        commandId: `human:setup:${index}`, expectedStateVersion: view.stateVersion, command,
      }))).accepted).toBe(true)
      await requireValue(network.service.getGameSession(first.roomCode)).advanceAi()
      const after = await Promise.all(network.clients.map((client) => networkSnapshot(network, client)))
      expect(after[0]?.view.publicGame).toEqual(after[1]?.view.publicGame)
    }
    const views = await Promise.all(network.clients.map((client) => networkSnapshot(network, client)))
    const first = requireValue(views[0])
    expect(first.view.publicGame.turn.setup).toBeNull()
    const actorIndex = views.findIndex((update) => update.view.legalActions.canRollDice)
    const actor = requireValue(network.clients[actorIndex])
    expect(commandData(await actor.timeout(5_000).emitWithAck('game:command', gameCommandRequestSchema.parse({
      protocolVersion: REALTIME_PROTOCOL_VERSION, roomCode: first.roomCode, gameId: first.gameId,
      commandId: 'human:normal-roll', expectedStateVersion: first.view.stateVersion, command: { type: 'ROLL_DICE' },
    }))).accepted).toBe(true)
    const after = await Promise.all(network.clients.map((client) => networkSnapshot(network, client)))
    expect(after[0]?.view.publicGame).toEqual(after[1]?.view.publicGame)
    expect(after[0]?.view.publicGame.turn.lastRoll).not.toBeNull()
  })
})
