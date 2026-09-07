import { afterEach, describe, expect, it } from 'vitest'
import type { GameState } from '@frontier-isles/game-core/model/game-state'
import type { PlayerView } from '@frontier-isles/game-core/contracts/views'
import type { TradeId } from '@frontier-isles/game-core/model/ids'
import { createEmptyResourceBag } from '@frontier-isles/game-core/model/resource'
import { PersonalityAiAgent } from '@frontier-isles/game-ai/personality-ai-agent'
import { gameIdSchema, roomSnapshotSchema, type RoomSessionData } from '@frontier-isles/realtime-contracts'
import { InMemoryRoomService } from '../src/lobby/room-service.js'
import type { GameSessionDependencies } from '../src/game/game-session.js'
import { FakeLifecycleRuntime } from './fake-lifecycle-runtime.js'
import { actionFixture, requestFor, requireValue, successData } from './game-test-helpers.js'
import { workflowFixture } from './online-workflow-fixtures.js'

const services: InMemoryRoomService[] = []
const empty = createEmptyResourceBag()
function fixture(humans = 4, dependencies: GameSessionDependencies = {}) {
  const runtime = new FakeLifecycleRuntime()
  let state: GameState | null = null
  const rooms = new InMemoryRoomService({ runtime, reconnectGraceMs: 100, gameAbandonedTtlMs: 1_000,
    nextGameIdentity: () => ({ gameId: gameIdSchema.parse('game:presence-test'), seed: 'PRESENCE' }),
    gameDependencies: { ...dependencies,
      createState: (config, seed) => { state = (dependencies.createState ?? actionFixture)(config, seed); return state },
      afterTransition: (next, command) => { state = next; dependencies.afterTransition?.(next, command) },
    } })
  services.push(rooms)
  const members: RoomSessionData[] = [successData(rooms.createRoom('North'))]
  const first = requireValue(members[0])
  const code = first.credential.roomCode
  const snapshot = (): ReturnType<typeof roomSnapshotSchema.parse> => requireValue(rooms.getSnapshot(code))
  for (const name of ['East', 'South', 'West'].slice(0, humans - 1)) members.push(successData(rooms.joinRoom(code, name)))
  for (const seat of snapshot().seats) if (seat.occupancy === 'EMPTY') successData(rooms.setAiSeat(first.credential.sessionId, snapshot().revision, seat.seatId, 'BUILDER'))
  for (const member of members) successData(rooms.setReady(member.credential.sessionId, snapshot().revision, true))
  successData(rooms.requestStart(first.credential.sessionId, snapshot().revision))
  const game = requireValue(rooms.getGameSession(code))
  const session = (index: number): RoomSessionData['credential']['sessionId'] => requireValue(members[index]).credential.sessionId
  return { runtime, rooms, game, members, code, snapshot, session, state: (): GameState => requireValue(state) }
}
afterEach(() => { for (const service of services.splice(0)) service.dispose() })

describe('active-game Human presence policy', () => {
  it('disposes idempotently before late socket disconnect callbacks without rebuilding closed presence', () => {
    const room = fixture()
    room.rooms.dispose()
    room.rooms.dispose()
    expect(room.rooms.markDisconnected(room.session(0))).toMatchObject({ ok: false })
    expect(room.rooms.createRoom('Late arrival')).toMatchObject({ ok: false, error: { code: 'ROOM_CLOSED' } })
    expect(room.runtime.activeTaskCount).toBe(0)
    expect(room.rooms.roomCount).toBe(0)
    expect(room.game.lifecycleStatus).toBe('CLOSED')
  })
  it.each([0, 1])('pauses for disconnected Human %s, rejects every new Human mutation, and preserves exact state/RNG', async (index) => {
    const room = fixture()
    const before = room.state()
    successData(room.rooms.markDisconnected(room.session(index)))
    expect(room.game.lifecycleStatus).toBe('PAUSED_RECONNECTING')
    const actor = room.session(index === 0 ? 1 : 0)
    expect(await room.rooms.submitGameCommand(actor, requestFor(room.game, actor, { type: 'END_TURN' })))
      .toMatchObject({ ok: false, error: { code: 'GAME_PAUSED' } })
    await room.game.advanceAi()
    expect(room.state()).toBe(before)
    expect(room.snapshot().gamePresence).toMatchObject({ disconnectedSeats: [{ seatId: index === 0 ? 'NORTH' : 'EAST', reconnectDeadlineMs: 100, replacementRequired: false }] })
    expect(JSON.stringify(room.snapshot())).not.toMatch(/sessionId|token|resources|developmentCards|random|pendingDecision/u)
  })

  it('resumes at deadline minus one with the same identity/view and expires exactly at the boundary', () => {
    const room = fixture()
    const credential = requireValue(room.members[1]).credential
    const before = room.game.snapshot(credential.sessionId).view
    successData(room.rooms.markDisconnected(credential.sessionId))
    room.runtime.advanceBy(99)
    const resumed = successData(room.rooms.resumeSession(credential))
    expect(JSON.stringify(resumed.credential) === JSON.stringify(credential)).toBe(true)
    expect(room.game.snapshot(credential.sessionId).view).toEqual(before)
    expect(room.game.lifecycleStatus).toBe('ACTIVE')
    successData(room.rooms.markDisconnected(credential.sessionId))
    room.runtime.advanceBy(100)
    expect(room.game.lifecycleStatus).toBe('PAUSED_REPLACEMENT_REQUIRED')
    expect(room.rooms.resumeSession(credential)).toMatchObject({ ok: false, error: { code: 'SESSION_INVALID' } })
    expect(room.rooms.hasSession(credential.sessionId)).toBe(false)
    expect(room.game.snapshot(room.session(0)).view.publicGame).toEqual(before.publicGame)
  })

  it.each(['SEVEN', 'KNIGHT', 'BUILD_TRADE'] as const)('retains pending private decisions and hands through %s disconnect/resume', async (scenario) => {
    const room = fixture(4, { createState: (config) => workflowFixture(scenario, config) })
    const north = room.session(0)
    const view = room.game.snapshot(north).view
    const command = scenario === 'SEVEN' ? { type: 'ROLL_DICE' as const }
      : scenario === 'KNIGHT' ? { type: 'PLAY_DEVELOPMENT_CARD' as const, cardId: requireValue(view.legalActions.playableDevelopmentCardIds[0]) }
        : { type: 'PROPOSE_TRADE' as const, offer: { tradeId: 'trade:presence' as TradeId,
            initiatorId: view.self.id, proposedById: view.self.id, counterpartyId: requireValue(room.game.playerForSession(room.session(1))),
            parentTradeId: null, initiatorGives: { ...empty, LUMBER: 1 }, counterpartyGives: { ...empty, BRICK: 1 } } }
    expect(successData(await room.rooms.submitGameCommand(north, requestFor(room.game, north, command))).accepted).toBe(true)
    const index = scenario === 'BUILD_TRADE' ? 1 : 0
    const before = room.state()
    const privateView = room.game.snapshot(room.session(index)).view
    expect(privateView.pendingDecision).not.toBeNull()
    successData(room.rooms.markDisconnected(room.session(index)))
    room.runtime.advanceBy(50)
    successData(room.rooms.resumeSession(requireValue(room.members[index]).credential))
    expect(room.state()).toBe(before)
    expect(room.game.snapshot(room.session(index)).view).toEqual(privateView)
    expect(room.game.lifecycleStatus).toBe('ACTIVE')
  })

  it('returns an earlier exact cached outcome while paused without accepting a new mutation', async () => {
    const room = fixture()
    const north = room.session(0)
    const request = requestFor(room.game, north, { type: 'BUY_DEVELOPMENT_CARD' })
    const accepted = await room.rooms.submitGameCommand(north, request)
    successData(room.rooms.markDisconnected(room.session(1)))
    const before = room.state()
    expect(await room.rooms.submitGameCommand(north, request)).toEqual(accepted)
    expect(await room.rooms.submitGameCommand(north, requestFor(room.game, north, { type: 'END_TURN' })))
      .toMatchObject({ ok: false, error: { code: 'GAME_PAUSED' } })
    expect(room.state()).toBe(before)
  })

  it('requires all disconnected Humans to recover before clearing the pause', () => {
    const room = fixture()
    for (const index of [1, 2]) successData(room.rooms.markDisconnected(room.session(index)))
    successData(room.rooms.resumeSession(requireValue(room.members[1]).credential))
    expect(room.game.lifecycleStatus).toBe('PAUSED_RECONNECTING')
    expect(room.game.presenceSnapshot.disconnectedSeats.map((seat) => seat.seatId)).toEqual(['SOUTH'])
    successData(room.rooms.resumeSession(requireValue(room.members[2]).credential))
    expect(room.game.lifecycleStatus).toBe('ACTIVE')
  })

  it('permits only the connected current Host after expiry, preserving the replaced position with an AI overlay', async () => {
    const views: PlayerView[] = []
    const agent = new PersonalityAiAgent()
    const room = fixture(4, { aiAgent: { chooseNextCommand: async (view, context) => {
      views.push(view)
      return agent.chooseNextCommand(view, context)
    } } })
    const before = room.state()
    const oldPlayer = room.game.playerForSession(room.session(1))
    successData(room.rooms.markDisconnected(room.session(1)))
    const replace = (host = 0) => room.rooms.replaceExpiredHuman(room.session(host), room.game.gameId, room.snapshot().revision, 'EAST', 'BUILDER')
    expect(await replace()).toMatchObject({ ok: false, error: { code: 'REPLACEMENT_NOT_AVAILABLE' } })
    room.runtime.advanceBy(100)
    expect(await replace(2)).toMatchObject({ ok: false, error: { code: 'NOT_HOST' } })
    successData(await replace())
    expect(room.state()).toBe(before)
    expect(room.game.playerForSeat('EAST')).toBe(oldPlayer)
    expect(room.game.playerForSession(room.session(1))).toBeUndefined()
    expect(room.game.snapshot(room.session(0)).view.opponents.find((player) => player.id === oldPlayer)?.controller).toEqual({ type: 'AI', profileId: 'BUILDER' })
    expect(before.players[requireValue(oldPlayer)]?.controller).toEqual({ type: 'HUMAN' })
    expect(room.game.presenceSnapshot.replacements).toEqual([{ seatId: 'EAST', profileId: 'BUILDER' }])
    expect(room.game.lifecycleStatus).toBe('ACTIVE')
    expect(room.rooms.resumeSession(requireValue(room.members[1]).credential)).toMatchObject({ ok: false, error: { code: 'SESSION_INVALID' } })
    expect(successData(await room.rooms.submitGameCommand(room.session(0), requestFor(room.game, room.session(0), { type: 'END_TURN' }))).accepted).toBe(true)
    expect(views.length).toBeGreaterThan(0)
    expect(views[0]?.self.id).toBe(oldPlayer)
    expect(views[0]?.self.resources).toEqual(before.players[requireValue(oldPlayer)]?.resources)
    expect(views.every((view) => view.opponents.every((player) => !('resources' in player) && !('developmentCards' in player)))).toBe(true)
    expect(room.game.lifecycleStatus).toBe('ACTIVE')
  })

  it('transfers an expired Host to the first connected Human, including one who resumes while others are still in grace', async () => {
    const room = fixture()
    successData(room.rooms.markDisconnected(room.session(0)))
    room.runtime.advanceBy(10)
    for (const index of [1, 2, 3]) successData(room.rooms.markDisconnected(room.session(index)))
    room.runtime.advanceBy(90)
    expect(room.snapshot().hostSeatId).toBe('NORTH')
    successData(room.rooms.resumeSession(requireValue(room.members[2]).credential))
    expect(room.snapshot().hostSeatId).toBe('SOUTH')
    successData(await room.rooms.replaceExpiredHuman(room.session(2), room.game.gameId, room.snapshot().revision, 'NORTH', 'SENTINEL'))
    expect(room.game.lifecycleStatus).toBe('PAUSED_RECONNECTING')
    expect(room.game.presenceSnapshot.replacements).toEqual([{ seatId: 'NORTH', profileId: 'SENTINEL' }])
  })

  it('selects EAST before other connected Humans when the Host expires', () => {
    const room = fixture()
    successData(room.rooms.markDisconnected(room.session(0)))
    room.runtime.advanceBy(100)
    expect(room.snapshot().hostSeatId).toBe('EAST')
  })

  it.each([false, true])('does not apply a held AI choice spanning a pause (resume before choice returns: %s)', async (earlyResume) => {
    let release: () => void = () => {}
    let entered: () => void = () => {}
    const gate = new Promise<void>((resolve) => { release = resolve })
    const started = new Promise<void>((resolve) => { entered = resolve })
    const agent = new PersonalityAiAgent()
    let choices = 0
    const room = fixture(2, { createState: (config, seed) => {
      const state = actionFixture(config, seed)
      return { ...state, turn: { ...state.turn, currentPlayerId: config.players[2].id } }
    }, aiAgent: { chooseNextCommand: async (view, context) => {
      choices += 1
      if (choices === 1) { entered(); await gate; return { type: 'BUY_DEVELOPMENT_CARD' } }
      return agent.chooseNextCommand(view, context)
    } } })
    const before = room.state()
    const advance = room.game.advanceAi()
    await started
    successData(room.rooms.markDisconnected(room.session(1)))
    await room.game.advanceAi()
    expect(room.state()).toBe(before)
    expect(choices).toBe(1)
    if (earlyResume) successData(room.rooms.resumeSession(requireValue(room.members[1]).credential))
    release()
    await advance
    if (!earlyResume) {
      expect(room.state()).toBe(before)
      expect(choices).toBe(1)
      successData(room.rooms.resumeSession(requireValue(room.members[1]).credential))
      await room.game.advanceAi()
    }
    expect(choices).toBeGreaterThan(1)
    expect(room.game.lifecycleStatus).toBe('ACTIVE')
    expect(room.state().stateVersion).toBeGreaterThan(before.stateVersion)
  })

  it('keeps an all-disconnected game within grace, then closes when no eligible Humans remain', () => {
    const room = fixture()
    const before = room.state()
    for (const member of room.members) successData(room.rooms.markDisconnected(member.credential.sessionId))
    room.runtime.advanceBy(99)
    expect(room.rooms.getSnapshot(room.code)).not.toBeNull()
    room.runtime.advanceBy(1)
    expect(room.rooms.getSnapshot(room.code)).toBeNull()
    expect(room.game.lifecycleStatus).toBe('CLOSED')
    expect(room.state()).toBe(before)
    expect(room.runtime.activeTaskCount).toBe(0)
  })

  it('allows Host closure only while replacement is required and clears every timer and credential', () => {
    const room = fixture()
    const close = (host = 0) => room.rooms.closeActiveGame(room.session(host), room.game.gameId, room.snapshot().revision)
    expect(close()).toMatchObject({ ok: false, error: { code: 'REPLACEMENT_NOT_AVAILABLE' } })
    successData(room.rooms.markDisconnected(room.session(1)))
    room.runtime.advanceBy(100)
    expect(close(2)).toMatchObject({ ok: false, error: { code: 'NOT_HOST' } })
    successData(close())
    expect(room.game.lifecycleStatus).toBe('CLOSED')
    expect(room.runtime.activeTaskCount).toBe(0)
    for (const member of room.members) expect(room.rooms.hasSession(member.credential.sessionId)).toBe(false)
  })

  it('expires an abandoned replacement decision without extending its deadline on snapshot reads', () => {
    const room = fixture()
    successData(room.rooms.markDisconnected(room.session(1)))
    room.runtime.advanceBy(100)
    expect(room.snapshot().gamePresence?.abandonedDeadlineMs).toBe(1_100)
    room.runtime.advanceBy(999)
    successData(room.rooms.requestSnapshot(room.session(0)))
    room.runtime.advanceBy(1)
    expect(room.rooms.getSnapshot(room.code)).toBeNull()
    expect(room.runtime.activeTaskCount).toBe(0)
  })

  it('retains a completed game for its configured interval and then cleans it up', async () => {
    const room = fixture(4, { createState: (config) => workflowFixture('VICTORY', config) })
    const north = room.session(0)
    const vertexId = requireValue(room.game.snapshot(north).view.legalActions.legalCityUpgradeVertexIds[0])
    expect(successData(await room.rooms.submitGameCommand(north, requestFor(room.game, north, { type: 'UPGRADE_CITY', vertexId }))).accepted).toBe(true)
    expect(room.snapshot().lifecycleStatus).toBe('FINISHED')
    expect(room.snapshot().gamePresence?.abandonedDeadlineMs).toBe(1_000)
    room.runtime.advanceBy(999)
    expect(room.rooms.getSnapshot(room.code)).not.toBeNull()
    room.runtime.advanceBy(1)
    expect(room.rooms.getSnapshot(room.code)).toBeNull()
    expect(room.runtime.activeTaskCount).toBe(0)
  })
})
