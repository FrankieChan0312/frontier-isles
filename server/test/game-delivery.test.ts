import { describe, expect, it, vi } from 'vitest'
import type { GameState } from '@frontier-isles/game-core/model/game-state'
import type { TradeId } from '@frontier-isles/game-core/model/ids'
import { createEmptyResourceBag } from '@frontier-isles/game-core/model/resource'
import { assertTradingState } from '@frontier-isles/game-core/engine/trading-invariants'
import { PersonalityAiAgent } from '@frontier-isles/game-ai/personality-ai-agent'
import { gameIdSchema, roomCodeSchema } from '@frontier-isles/realtime-contracts'
import { GameExecutionQueue, GameQueueFullError } from '../src/game/game-execution-queue.js'
import { GameSession } from '../src/game/game-session.js'
import { actionFixture, requestFor, requireValue, successData, testSeats, testSession, TEST_SESSION_IDS } from './game-test-helpers.js'
import { workflowFixture } from './online-workflow-fixtures.js'

const north = requireValue(TEST_SESSION_IDS[0])
const east = requireValue(TEST_SESSION_IDS[1])
const empty = createEmptyResourceBag()

function deferred(): { readonly promise: Promise<void>; readonly resolve: () => void } {
  let resolve: () => void = () => { throw new Error('Deferred not initialized.') }
  const promise = new Promise<void>((settle) => { resolve = settle })
  return { promise, resolve }
}

describe('bounded per-game execution queue', () => {
  it('keeps FIFO order across awaits, bounds admission and releases after rejection', async () => {
    const queue = new GameExecutionQueue(2)
    const gate = deferred()
    const order: number[] = []
    const first = queue.run(async () => { order.push(1); await gate.promise; order.push(2) })
    const second = queue.run(() => { order.push(3); throw new Error('Expected test rejection.') })
    const rejected = expect(second).rejects.toThrow('Expected test rejection.')
    await expect(queue.run(() => order.push(99))).rejects.toBeInstanceOf(GameQueueFullError)
    expect(queue.size).toBe(2)
    gate.resolve()
    await first
    await rejected
    await queue.run(() => order.push(4))
    expect(order).toEqual([1, 2, 3, 4])
    expect(queue.size).toBe(0)
    for (const capacity of [0, -1, 1.5, 257]) expect(() => new GameExecutionQueue(capacity)).toThrow()
  })
})

describe('command identity and serialized Human/AI pipelines', () => {
  it('canonicalizes property order, rejects changed payload/version, and isolates session caches', async () => {
    const transition = vi.fn()
    const game = testSession(4, { createState: actionFixture, afterTransition: transition })
    const request = requestFor(game, north, { type: 'PROPOSE_TRADE', offer: {
      tradeId: 'trade:delivery' as TradeId, initiatorId: requireValue(game.playerForSession(north)),
      counterpartyId: requireValue(game.playerForSession(east)), proposedById: requireValue(game.playerForSession(north)),
      parentTradeId: null, initiatorGives: { ...empty, LUMBER: 1 }, counterpartyGives: { ...empty, BRICK: 1 },
    } })
    const first = await game.dispatchHuman(north, request, () => true)
    const before = game.snapshot(north)
    const reordered = { ...request, command: request.command.type === 'PROPOSE_TRADE'
      ? { type: 'PROPOSE_TRADE' as const, offer: { ...request.command.offer,
          initiatorGives: { ORE: 0, GRAIN: 0, WOOL: 0, BRICK: 0, LUMBER: 1 } } } : request.command }
    expect(await game.dispatchHuman(north, reordered, () => true)).toEqual(first)
    for (const conflicting of [{ ...request, command: { type: 'END_TURN' as const } },
      { ...request, expectedStateVersion: request.expectedStateVersion + 1 }]) {
      expect(await game.dispatchHuman(north, conflicting, () => true)).toMatchObject({ ok: false, error: { code: 'COMMAND_ID_CONFLICT' } })
    }
    expect(await game.dispatchHuman(east, request, () => true)).toMatchObject({ ok: true, data: { accepted: false } })
    expect(game.snapshot(north)).toEqual(before)
    expect(transition).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(first)).not.toMatch(/fingerprint|cache|resources|offer|sessionId|random/u)
  })

  it('uses insertion FIFO, never refreshes on read, and an evicted success cannot execute again', async () => {
    const transition = vi.fn()
    const game = testSession(4, { createState: actionFixture, commandCacheSize: 2, afterTransition: transition })
    const first = requestFor(game, north, { type: 'BUY_DEVELOPMENT_CARD' }, 'first')
    const original = await game.submitHuman(north, first)
    await game.submitHuman(north, requestFor(game, north, { type: 'END_TURN' }, 'second'))
    expect(await game.submitHuman(north, first)).toEqual(original)
    await game.submitHuman(north, requestFor(game, north, { type: 'END_TURN' }, 'third'))
    const before = game.snapshot(north)
    expect(await game.submitHuman(north, first)).toMatchObject({ ok: true, data: { accepted: false,
      violation: { code: 'STALE_STATE_VERSION' } } })
    expect(game.snapshot(north)).toEqual(before)
    expect(transition).toHaveBeenCalledTimes(2)
  })

  it('orders competing same-session and different-session/current-player requests explicitly', async () => {
    const states: GameState[] = []
    const game = testSession(4, { createState: actionFixture, afterTransition: (state) => { states.push(state) } })
    const requests = [requestFor(game, north, { type: 'BUY_DEVELOPMENT_CARD' }, 'one'),
      requestFor(game, north, { type: 'BUY_DEVELOPMENT_CARD' }, 'two'),
      requestFor(game, east, { type: 'END_TURN' }, 'three')]
    const results = await Promise.all(requests.map((request, index) => game.dispatchHuman(index === 2 ? east : north, request, () => true)))
    expect(results[0]).toMatchObject({ ok: true, data: { accepted: true, stateVersion: 17 } })
    for (const result of results.slice(1)) expect(result).toMatchObject({ ok: true,
      data: { accepted: false, violation: { code: 'STALE_STATE_VERSION' } } })
    expect(states).toHaveLength(1)
    assertTradingState(requireValue(states[0]))
  })

  it('serializes two simultaneously eligible discards, then accepts the resynchronized second decision', async () => {
    const game = testSession(4, { createState: (config) => workflowFixture('SEVEN', config) })
    await game.dispatchHuman(north, requestFor(game, north, { type: 'ROLL_DICE' }), () => true)
    const eastBrick = game.snapshot(east).view.self.resources.BRICK
    const first = requestFor(game, north, { type: 'DISCARD_RESOURCES', resources: { ...empty, LUMBER: 4 } })
    const second = requestFor(game, east, { type: 'DISCARD_RESOURCES', resources: { ...empty, BRICK: 4 } })
    const results = await Promise.all([game.dispatchHuman(north, first, () => true), game.dispatchHuman(east, second, () => true)])
    expect(results[0]).toMatchObject({ ok: true, data: { accepted: true } })
    expect(results[1]).toMatchObject({ ok: true, data: { accepted: false, violation: { code: 'STALE_STATE_VERSION' } } })
    const retried = await game.dispatchHuman(east, requestFor(game, east, second.command), () => true)
    expect(retried).toMatchObject({ ok: true, data: { accepted: true } })
    expect(game.snapshot(north).view.self.resources.LUMBER).toBe(4)
    expect(game.snapshot(east).view.self.resources.BRICK).toBe(eastBrick - 4)
  })

  it('returns the original End Turn outcome after AI advancement without rerunning AI, RNG or publication', async () => {
    const agent = new PersonalityAiAgent()
    const choose = vi.spyOn(agent, 'chooseNextCommand')
    let state: GameState | null = null
    const game = testSession(2, { aiAgent: agent, createState: (config, seed) => {
      const base = actionFixture(config, seed)
      return { ...base, turn: { ...base.turn, currentPlayerId: config.players[1].id } }
    }, afterTransition: (next) => { state = next } })
    const publication = vi.fn()
    game.subscribe(publication)
    const request = requestFor(game, east, { type: 'END_TURN' })
    const original = await game.dispatchHuman(east, request, () => true)
    expect(original).toMatchObject({ ok: true, data: { accepted: true, stateVersion: 17 } })
    expect(choose).toHaveBeenCalled()
    const before = requireValue<GameState>(state)
    const view = game.snapshot(north)
    const publications = publication.mock.calls.length
    const choices = choose.mock.calls.length
    expect(await game.dispatchHuman(east, request, () => true)).toEqual(original)
    expect(state).toBe(before)
    expect(game.snapshot(north)).toEqual(view)
    expect(publication).toHaveBeenCalledTimes(publications)
    expect(choose).toHaveBeenCalledTimes(choices)
  })

  it('holds one AI pipeline, rechecks queued socket authority, and lets another Room progress', async () => {
    const gate = deferred()
    const entered = deferred()
    const agent = new PersonalityAiAgent()
    let held = false
    let active = 0
    let maximumActive = 0
    const first = testSession(2, { maxQueuedOperations: 2, createState: (config, seed) => {
      const base = actionFixture(config, seed)
      return { ...base, turn: { ...base.turn, currentPlayerId: config.players[2].id } }
    }, aiAgent: { chooseNextCommand: async (view, context) => {
      active += 1
      maximumActive = Math.max(maximumActive, active)
      expect(view.opponents.every((player) => !('resources' in player) && !('developmentCards' in player))).toBe(true)
      if (!held) { held = true; entered.resolve(); await gate.promise }
      try { return await agent.chooseNextCommand(view, context) } finally { active -= 1 }
    } } })
    const advancement = first.advanceAi()
    expect(first.advanceAi()).toBe(advancement)
    await entered.promise
    let authorized = true
    const queued = first.dispatchHuman(north, requestFor(first, north, { type: 'END_TURN' }), () => authorized)
    const overloaded = await first.dispatchHuman(north, requestFor(first, north, { type: 'END_TURN' }, 'overload'), () => true)
    expect(overloaded).toMatchObject({ ok: false, error: { code: 'GAME_BUSY' } })
    const second = new GameSession(roomCodeSchema.parse('DEF567'), gameIdSchema.parse('game:other-room'), testSeats(4), 'OTHER', { createState: actionFixture })
    expect(successData(await second.dispatchHuman(north, requestFor(second, north, { type: 'BUY_DEVELOPMENT_CARD' }), () => true)).accepted).toBe(true)
    expect(active).toBe(1)
    authorized = false
    gate.resolve()
    await advancement
    expect(await queued).toMatchObject({ ok: false, error: { code: 'NOT_ROOM_MEMBER' } })
    expect(maximumActive).toBe(1)
  })
})
