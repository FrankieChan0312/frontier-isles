import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GameCommand } from '@frontier-isles/game-core/contracts/commands'
import type { TradeId } from '@frontier-isles/game-core/model/ids'
import { createEmptyResourceBag, RESOURCE_TYPES } from '@frontier-isles/game-core/model/resource'
import { resumeTokenSchema } from '@frontier-isles/realtime-contracts'
import type { MultiplayerRepository } from '../src/persistence/multiplayer-repository.js'
import type { GameSessionDependencies } from '../src/game/game-session.js'
import { FakeLifecycleRuntime } from './fake-lifecycle-runtime.js'
import { actionFixture, requireValue, requestFor, successData } from './game-test-helpers.js'
import { workflowFixture } from './online-workflow-fixtures.js'
import { persistentRoom, restoredService, resumeEveryHuman } from './persistence-test-helpers.js'

export function defineRecoveryContract(openStorage: () => { readonly open: () => MultiplayerRepository | Promise<MultiplayerRepository>; readonly remove: () => void }): void {
const cleanup: (() => void | Promise<void>)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
async function fixture(dependencies: GameSessionDependencies = { createState: actionFixture }, humans = 4) {
  const directory = openStorage()
  cleanup.push(directory.remove)
  const repository = await directory.open()
  cleanup.push(async () => (await repository.close()))
  const room = (await persistentRoom(repository, undefined, dependencies, humans))
  cleanup.push(() => room.service.dispose())
  const restart = async (runtime = new FakeLifecycleRuntime(), nextDependencies: GameSessionDependencies = {}) => {
    room.service.dispose()
    await repository.close()
    const restoredRepository = await directory.open()
    cleanup.push(async () => (await restoredRepository.close()))
    const service = (await restoredService(restoredRepository, runtime, nextDependencies))
    cleanup.push(() => service.dispose())
    return { service, repository: restoredRepository, runtime }
  }
  return { ...room, repository, restart }
}
describe('multiplayer restart recovery', () => {
  it('commits a Human transition, cached result and publication revision once before any observer or acknowledgement', async () => {
    const room = (await fixture())
    const game = (await room.start())
    const north = requireValue(room.members[0]).credential.sessionId
    const originalSave = room.repository.save.bind(room.repository)
    let committed = requireValue((await room.repository.load())[0]).game
    const save = vi.spyOn(room.repository, 'save').mockImplementation(async (record) => {
      await originalSave(record)
      committed = structuredClone(record.game)
    })
    let publications = 0
    const unsubscribe = game.subscribe(({ update }) => {
      const stored = requireValue(committed)
      expect(stored.state.stateVersion).toBe(update.view.stateVersion)
      expect(stored.publicationRevision).toBe(update.publicationRevision)
      expect(stored.commandCache[0]?.entries[0]?.result.accepted).toBe(true)
      publications += 1
    })
    const result = await room.service.submitGameCommand(north, requestFor(game, north, { type: 'BUY_DEVELOPMENT_CARD' }))
    expect(successData(result).accepted).toBe(true)
    expect(save).toHaveBeenCalledTimes(1)
    expect(publications).toBe(4)
    unsubscribe()
    save.mockRestore()
  })

  it('restores a waiting Room, exact revision/Host/seats/Ready and original digest-authenticated identities', async () => {
    const room = (await fixture({}, 2))
    const before = room.snapshot()
    const next = (await room.restart())
    const recovered = requireValue(next.service.getSnapshot(before.roomCode))
    expect(recovered.revision).toBe(before.revision)
    expect(recovered.hostSeatId).toBe(before.hostSeatId)
    expect(recovered.seats.slice(2)).toEqual(before.seats.slice(2))
    expect(recovered.seats.slice(0, 2).every((seat) => seat.occupancy === 'HUMAN' && seat.connectionStatus === 'RECONNECTING')).toBe(true)
    const member = requireValue(room.members[0])
    const wrong = { ...member.credential, resumeToken: resumeTokenSchema.parse('x'.repeat(43)) }
    expect((await next.service.resumeSession(wrong))).toMatchObject({ ok: false, error: { code: 'SESSION_INVALID' } })
    expect(successData((await next.service.resumeSession(member.credential))).credential).toEqual(member.credential)
    successData((await next.service.resumeSession(requireValue(room.members[1]).credential)))
    expect(requireValue(next.service.getSnapshot(before.roomCode)).seats).toEqual(before.seats)
  })

  it('restores exact active state/RNG/private cards and a recent successful result atomically', async () => {
    const room = (await fixture())
    const game = (await room.start())
    const north = requireValue(room.members[0]).credential.sessionId
    const request = requestFor(game, north, { type: 'BUY_DEVELOPMENT_CARD' })
    const accepted = await room.service.submitGameCommand(north, request)
    expect(successData(accepted).accepted).toBe(true)
    const before = game.exportPersistence()
    const roomRevision = room.snapshot().revision
    const views = room.members.map((member) => game.snapshot(member.credential.sessionId).view)
    const next = (await room.restart())
    const restored = requireValue(next.service.getGameSession(game.roomCode))
    expect(restored.lifecycleStatus).toBe('PAUSED_RECONNECTING')
    expect(restored.exportPersistence().state).toEqual(before.state)
    expect(restored.exportPersistence().commandCache).toEqual(before.commandCache)
    expect(requireValue(next.service.getSnapshot(game.roomCode)).revision).toBe(roomRevision)
    expect(restored.presenceSnapshot.disconnectedSeats.every((seat) => seat.reconnectDeadlineMs === 1200)).toBe(true)
    await restored.advanceAi()
    expect(restored.exportPersistence().state).toEqual(before.state)
    await resumeEveryHuman(next.service, room.members)
    expect(restored.lifecycleStatus).toBe('ACTIVE')
    for (const [index, member] of room.members.entries()) expect(restored.snapshot(member.credential.sessionId).view).toEqual(views[index])
    const publication = restored.snapshot(north).publicationRevision
    expect(await next.service.submitGameCommand(north, request)).toEqual(accepted)
    expect(restored.exportPersistence().state).toEqual(before.state)
    expect(restored.snapshot(north).publicationRevision).toBe(publication)
    expect(await next.service.submitGameCommand(north, { ...request, command: { type: 'END_TURN' } }))
      .toMatchObject({ ok: false, error: { code: 'COMMAND_ID_CONFLICT' } })
    expect(successData(await next.service.submitGameCommand(north, requestFor(restored, north, { type: 'END_TURN' }))).accepted).toBe(true)
    expect(restored.exportPersistence().state.stateVersion).toBe(before.state.stateVersion + 1)
  })

  it.each(['SEVEN', 'KNIGHT', 'BUILD_TRADE'] as const)('retains the exact private pending decision through %s restart', async (scenario) => {
    const room = (await fixture({ createState: (config) => workflowFixture(scenario, config) }))
    const game = (await room.start())
    const north = requireValue(room.members[0]).credential.sessionId
    const east = requireValue(room.members[1]).credential.sessionId
    const view = game.snapshot(north).view
    const empty = createEmptyResourceBag()
    const command: GameCommand = scenario === 'SEVEN' ? { type: 'ROLL_DICE' }
      : scenario === 'KNIGHT' ? { type: 'PLAY_DEVELOPMENT_CARD', cardId: requireValue(view.legalActions.playableDevelopmentCardIds[0]) }
        : { type: 'PROPOSE_TRADE', offer: { tradeId: 'trade:restart' as TradeId, initiatorId: view.self.id,
            proposedById: view.self.id, counterpartyId: requireValue(game.playerForSession(east)), parentTradeId: null,
            initiatorGives: { ...empty, LUMBER: 1 }, counterpartyGives: { ...empty, BRICK: 1 } } }
    expect(successData(await room.service.submitGameCommand(north, requestFor(game, north, command))).accepted).toBe(true)
    const before = game.exportPersistence().state
    const privateViews = room.members.map((member) => game.snapshot(member.credential.sessionId).view)
    expect(before.pendingDecision).not.toBeNull()
    const next = (await room.restart())
    const restored = requireValue(next.service.getGameSession(game.roomCode))
    expect(restored.exportPersistence().state).toEqual(before)
    await resumeEveryHuman(next.service, room.members)
    for (const [index, member] of room.members.entries()) expect(restored.snapshot(member.credential.sessionId).view).toEqual(privateViews[index])
    const actor = scenario === 'BUILD_TRADE' ? east : north
    const current = restored.snapshot(actor).view
    const discarded = { ...empty }
    let needed = current.legalActions.requiredDiscardCount ?? 0
    for (const resource of RESOURCE_TYPES) {
      discarded[resource] = Math.min(needed, current.self.resources[resource])
      needed -= discarded[resource]
    }
    const followup: GameCommand = scenario === 'SEVEN' ? { type: 'DISCARD_RESOURCES', resources: discarded }
      : scenario === 'KNIGHT' ? { type: 'MOVE_ROBBER', tileId: requireValue(current.legalActions.legalRobberTileIds[0]) }
        : { type: 'REJECT_TRADE', tradeId: 'trade:restart' as TradeId }
    expect(successData(await next.service.submitGameCommand(actor, requestFor(restored, actor, followup))).accepted).toBe(true)
    expect(restored.exportPersistence().state.stateVersion).toBe(before.stateVersion + 1)
  })

  it('retains irreversible AI ownership and denies the old Human after restart', async () => {
    const room = (await fixture())
    const game = (await room.start())
    const old = requireValue(room.members[1])
    const host = requireValue(room.members[0]).credential.sessionId
    successData((await room.service.markDisconnected(old.credential.sessionId)))
    await room.runtime.advanceBy(100)
    successData(await room.service.replaceExpiredHuman(host, game.gameId, room.snapshot().revision, 'EAST', 'SENTINEL'))
    const before = game.exportPersistence()
    const next = (await room.restart())
    const restored = requireValue(next.service.getGameSession(game.roomCode))
    expect(restored.exportPersistence().state).toEqual(before.state)
    expect(restored.presenceSnapshot.replacements).toEqual([{ seatId: 'EAST', profileId: 'SENTINEL' }])
    expect(restored.playerForSession(old.credential.sessionId)).toBeUndefined()
    expect((await next.service.resumeSession(old.credential))).toMatchObject({ ok: false, error: { code: 'SESSION_INVALID' } })
    await resumeEveryHuman(next.service, room.members.filter((member) => member !== old))
    expect(restored.lifecycleStatus).toBe('ACTIVE')
    expect(restored.snapshot(host).view.opponents.find((player) => player.id === game.playerForSeat('EAST'))?.controller)
      .toEqual({ type: 'AI', profileId: 'SENTINEL' })
  })

  it('persists rejected results and cache insertion order with the configured retention bound', async () => {
    const room = (await fixture({ createState: actionFixture, commandCacheSize: 2 }))
    const game = (await room.start())
    const east = requireValue(room.members[1]).credential.sessionId
    const requests = ['first', 'second', 'third'].map((suffix) => requestFor(game, east, { type: 'END_TURN' }, suffix))
    const results = []
    for (const request of requests) results.push(await room.service.submitGameCommand(east, request))
    expect(results.every((result) => result.ok && !result.data.accepted)).toBe(true)
    const saved = game.exportPersistence()
    expect(saved.commandCache[0]?.entries.map((entry) => entry.result.commandId)).toEqual(requests.slice(1).map((request) => request.commandId))
    const next = (await room.restart())
    const restored = requireValue(next.service.getGameSession(game.roomCode))
    await resumeEveryHuman(next.service, room.members)
    expect(restored.exportPersistence().cacheLimit).toBe(2)
    expect(await next.service.submitGameCommand(east, requireValue(requests[1]))).toEqual(results[1])
    expect(restored.exportPersistence().commandCache).toEqual(saved.commandCache)
  })

  it('keeps explicit Host closure durable and rejects all former credentials after restart', async () => {
    const room = (await fixture())
    const game = (await room.start())
    successData((await room.service.markDisconnected(requireValue(room.members[1]).credential.sessionId)))
    await room.runtime.advanceBy(100)
    successData((await room.service.closeActiveGame(requireValue(room.members[0]).credential.sessionId, game.gameId, room.snapshot().revision)))
    expect((await room.repository.load())).toEqual([])
    const next = (await room.restart())
    expect(next.service.roomCount).toBe(0)
    for (const member of room.members) expect((await next.service.resumeSession(member.credential))).toMatchObject({ ok: false })
    expect(next.runtime.activeTaskCount).toBe(0)
  })

  it('keeps earlier disconnection deadlines and never revives expired credentials during restart', async () => {
    const room = (await fixture())
    const game = (await room.start())
    const east = requireValue(room.members[1])
    successData((await room.service.markDisconnected(east.credential.sessionId)))
    const clock = new FakeLifecycleRuntime()
    await clock.advanceBy(100)
    const next = (await room.restart(clock))
    const restored = requireValue(next.service.getGameSession(game.roomCode))
    expect(restored.lifecycleStatus).toBe('PAUSED_REPLACEMENT_REQUIRED')
    expect(restored.presenceSnapshot.disconnectedSeats.find((seat) => seat.seatId === 'EAST'))
      .toEqual({ seatId: 'EAST', reconnectDeadlineMs: 100, replacementRequired: true })
    expect((await next.service.resumeSession(east.credential))).toMatchObject({ ok: false, error: { code: 'SESSION_INVALID' } })
    expect(restored.presenceSnapshot.disconnectedSeats.find((seat) => seat.seatId === 'NORTH')?.reconnectDeadlineMs).toBe(1300)
  })

  it('removes an expired waiting Room durably during startup', async () => {
    const room = (await fixture())
    const code = room.snapshot().roomCode
    const clock = new FakeLifecycleRuntime()
    await clock.advanceBy(5000)
    const next = (await room.restart(clock))
    expect(next.service.getSnapshot(code)).toBeNull()
    expect((await next.repository.load())).toEqual([])
    expect(next.runtime.activeTaskCount).toBe(0)
  })

  it('recovers finished state with its original cleanup deadline and then removes it durably', async () => {
    const room = (await fixture({ createState: (config) => workflowFixture('VICTORY', config) }))
    const game = (await room.start())
    const north = requireValue(room.members[0]).credential.sessionId
    const vertexId = requireValue(game.snapshot(north).view.legalActions.legalCityUpgradeVertexIds[0])
    successData(await room.service.submitGameCommand(north, requestFor(game, north, { type: 'UPGRADE_CITY', vertexId })))
    const before = game.exportPersistence().state
    const next = (await room.restart())
    expect(requireValue(next.service.getGameSession(game.roomCode)).exportPersistence().state).toEqual(before)
    expect(requireValue(next.service.getSnapshot(game.roomCode)).gamePresence?.abandonedDeadlineMs).toBe(3000)
    await resumeEveryHuman(next.service, room.members)
    await next.runtime.advanceBy(3000)
    expect(next.service.getSnapshot(game.roomCode)).toBeNull()
    expect((await next.repository.load())).toEqual([])
    expect(next.runtime.activeTaskCount).toBe(0)
  })

  it('stops an awaited AI choice, settles queued work and flushes accepted state without closing the durable game', async () => {
    let entered: () => void = () => {}
    const started = new Promise<void>((resolve) => { entered = resolve })
    let release: (command: GameCommand) => void = () => {}
    const choice = new Promise<GameCommand>((resolve) => { release = resolve })
    const room = (await fixture({ createState: (config, seed) => {
      const state = actionFixture(config, seed)
      return { ...state, turn: { ...state.turn, currentPlayerId: config.players[2].id } }
    }, aiAgent: { chooseNextCommand: () => { entered(); return choice } } }, 2))
    const game = (await room.start())
    const before = game.exportPersistence().state
    const advance = game.advanceAi()
    await started
    const north = requireValue(room.members[0]).credential.sessionId
    const queued = room.service.submitGameCommand(north, requestFor(game, north, { type: 'END_TURN' }))
    await room.service.shutdown()
    await advance
    expect(await queued).toMatchObject({ ok: false })
    expect(game.exportPersistence().state).toEqual(before)
    expect(requireValue((await room.repository.load())[0]).game?.presence.lifecycleStatus).toBe('ACTIVE')
    release({ type: 'END_TURN' })
    const next = (await room.restart())
    expect(requireValue(next.service.getGameSession(game.roomCode)).exportPersistence().state).toEqual(before)
    expect(requireValue(next.service.getGameSession(game.roomCode)).lifecycleStatus).toBe('PAUSED_RECONNECTING')
    expect(room.runtime.activeTaskCount).toBe(0)
  })
})
}
