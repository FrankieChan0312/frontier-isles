import { describe, expect, it, vi } from 'vitest'
import type { GameCommand } from '@frontier-isles/game-core/contracts/commands'
import type { GameState } from '@frontier-isles/game-core/model/game-state'
import type { CommandId, TradeId } from '@frontier-isles/game-core/model/ids'
import { createEmptyResourceBag } from '@frontier-isles/game-core/model/resource'
import { gameEngine } from '@frontier-isles/game-core/engine/game-engine'
import { createOnlineGame } from '@frontier-isles/game-core/engine/create-game'
import { moveStandardCardToPlayer } from '@frontier-isles/game-core/engine/task-10-development-card.test-helper'
import { PersonalityAiAgent } from '@frontier-isles/game-ai/personality-ai-agent'
import { gameUpdateSchema, sessionIdSchema, type GameUpdate } from '@frontier-isles/realtime-contracts'
import { actionFixture, completedSetup, requestFor, requireValue, successData, testSession, TEST_SESSION_IDS, withHands } from './game-test-helpers.js'

const north = requireValue(TEST_SESSION_IDS[0])
const east = requireValue(TEST_SESSION_IDS[1])

describe('authoritative GameSession', () => {
  it.each([2, 3, 4])('maps %i Humans and canonical authoritative AI profiles without socket identity', (humans) => {
    const game = testSession(humans)
    expect(game.playerForSeat('NORTH')).toBe('player:ABC234:NORTH')
    expect(game.playerForSession(north)).toBe(game.playerForSeat('NORTH'))
    const view = game.snapshot(north).view
    expect([view.self, ...view.opponents].filter((player) => player.controller.type === 'HUMAN')).toHaveLength(humans)
    if (humans === 2) expect(view.opponents.find((player) => player.id === game.playerForSeat('SOUTH'))?.controller)
      .toEqual({ type: 'AI', profileId: 'BUILDER' })
    expect(gameUpdateSchema.safeParse(game.snapshot(east)).success).toBe(true)
  })

  it('injects the session actor, rejects stale/non-current commands and caches the original result exactly once', () => {
    const accepted = vi.fn()
    const game = testSession(2, { createState: actionFixture, afterTransition: accepted })
    const wrongActor = game.submitHuman(east, requestFor(game, east, { type: 'END_TURN' }))
    expect(wrongActor).toMatchObject({ ok: true, data: { accepted: false, violation: { code: 'NOT_YOUR_TURN' } } })
    const request = requestFor(game, north, { type: 'BUY_DEVELOPMENT_CARD' })
    const first = game.submitHuman(north, request)
    expect(first).toMatchObject({ ok: true, data: { accepted: true, stateVersion: 17 } })
    expect(game.submitHuman(north, { ...request, command: { type: 'END_TURN' } })).toEqual(first)
    expect(accepted).toHaveBeenCalledTimes(1)
    const stale = { ...requestFor(game, north, { type: 'END_TURN' }), expectedStateVersion: 0 }
    expect(game.submitHuman(north, stale)).toMatchObject({ ok: true,
      data: { accepted: false, violation: { code: 'STALE_STATE_VERSION' } } })
    expect(game.submitHuman(sessionIdSchema.parse('unknown_session_0001'), request)).toMatchObject({ ok: false })
    expect(JSON.stringify(first)).not.toMatch(/cardType|developmentCards|resources|details|random|seed/u)
  })

  it('projects separate private views and redacts purchase events for every other Human', () => {
    const game = testSession(4, { createState: actionFixture })
    const updates: GameUpdate[] = []
    game.subscribe(({ update }) => updates.push(update))
    successData(game.submitHuman(north, requestFor(game, north, { type: 'BUY_DEVELOPMENT_CARD' })))
    game.publish()
    expect(updates).toHaveLength(4)
    for (const update of updates) {
      expect(gameUpdateSchema.safeParse(update).success).toBe(true)
      const event = update.events.find((entry) => entry.type === 'DEVELOPMENT_CARD_BOUGHT')
      if (update.view.self.id === game.playerForSession(north)) {
        expect(event).toMatchObject({ cardId: expect.any(String), cardType: expect.any(String) })
      } else expect(event).toMatchObject({ cardId: null, cardType: null })
      expect(update.view.opponents.every((player) => !('resources' in player) && !('developmentCards' in player))).toBe(true)
      expect(JSON.stringify(update)).not.toMatch(/"random"|"seed"|"developmentDeck"|"resumeToken"|"sessionId"|"players"/u)
    }
    expect(updates[0]?.view.publicGame).toEqual(updates[1]?.view.publicGame)
  })

  it('advances eligible AI through real setup and stops when the next decision belongs to a Human', async () => {
    let transitions = 0
    const game = testSession(2, {
      createState: (config, seed) => {
        const state = createOnlineGame(config, seed)
        // Choose a deterministic seed below with an AI first; do not alter engine turn rules.
        return state
      },
      afterTransition: () => { transitions += 1 },
    }, 'AI-FIRST-1')
    await game.advanceAi()
    let observedAiAdvancement = transitions > 0
    for (let iteration = 0; iteration < 12 && !observedAiAdvancement; iteration += 1) {
      const snapshot = game.snapshot(north)
      const actor = snapshot.view.publicGame.turn.currentPlayerId
      const session = TEST_SESSION_IDS.find((id) => game.playerForSession(id) === actor)
      if (session === undefined) throw new Error('AI failed to advance to a Human.')
      const view = game.snapshot(session).view
      const command: GameCommand = view.publicGame.turn.phase === 'SETUP_SETTLEMENT'
        ? { type: 'PLACE_INITIAL_SETTLEMENT', vertexId: requireValue(view.legalActions.legalInitialSettlementVertexIds?.[0]) }
        : { type: 'PLACE_INITIAL_ROAD', edgeId: requireValue(view.legalActions.legalInitialRoadEdgeIds?.[0]) }
      const before = transitions
      expect(successData(game.submitHuman(session, requestFor(game, session, command))).accepted).toBe(true)
      game.publish()
      await game.advanceAi()
      observedAiAdvancement = transitions > before + 1
    }
    expect(observedAiAdvancement).toBe(true)
    expect(game.snapshot(north).aiThinking).toBe(false)
    expect(game.lifecycleStatus).toBe('ACTIVE')
    const before = transitions
    await game.advanceAi()
    expect(transitions).toBe(before)
  })

  it('pauses for a Human trade response during an AI turn and resumes after that Human rejects', async () => {
    let transitions = 0
    const game = testSession(2, {
      createState: (config, seed) => {
        const state = actionFixture(config, seed)
        const initiatorId = config.players[2].id
        const responderId = config.players[0].id
        return { ...state, turn: { ...state.turn, currentPlayerId: initiatorId }, pendingDecision: {
          type: 'RESPOND_TO_TRADE', responderId, counterDepth: 0,
          offer: { tradeId: 'trade:pause' as TradeId, initiatorId, counterpartyId: responderId,
            proposedById: initiatorId, parentTradeId: null,
            initiatorGives: { ...createEmptyResourceBag(), LUMBER: 1 },
            counterpartyGives: { ...createEmptyResourceBag(), BRICK: 1 } },
        } }
      }, afterTransition: () => { transitions += 1 },
    })
    await game.advanceAi()
    expect(transitions).toBe(0)
    expect(game.snapshot(north).view.pendingDecision?.type).toBe('RESPOND_TO_TRADE')
    expect(game.snapshot(east).view.pendingDecision).toMatchObject({ type: 'TRADE_IN_PROGRESS' })
    expect(successData(game.submitHuman(east, requestFor(game, east,
      { type: 'REJECT_TRADE', tradeId: 'trade:pause' as TradeId }))).accepted).toBe(false)
    expect(successData(game.submitHuman(north, requestFor(game, north,
      { type: 'REJECT_TRADE', tradeId: 'trade:pause' as TradeId }))).accepted).toBe(true)
    game.publish()
    await game.advanceAi()
    expect(transitions).toBeGreaterThan(1)
    expect(game.lifecycleStatus).toBe('ACTIVE')
    expect(game.snapshot(north).aiThinking).toBe(false)
  })

  it('pauses on a Human discard and keeps that private command out of AI decision context', async () => {
    const agent = new PersonalityAiAgent()
    const choose = vi.spyOn(agent, 'chooseNextCommand')
    const game = testSession(2, {
      aiAgent: agent,
      createState: (config, seed) => {
        const base = completedSetup(config, seed)
        const actor = config.players[2].id
        const state: GameState = { ...withHands(base, {
          [config.players[0].id]: { ...createEmptyResourceBag(), BRICK: 8 },
        }), turn: { ...base.turn, currentPlayerId: actor }, random: { ...base.random, state: 259 } }
        const rolled = gameEngine.execute(state, { commandId: 'fixture:seven' as CommandId,
          actorId: actor, expectedStateVersion: state.stateVersion, command: { type: 'ROLL_DICE' } })
        if (!rolled.ok) throw new Error('Controlled seven fixture failed.')
        return rolled.state
      },
    })
    await game.advanceAi()
    expect(choose).not.toHaveBeenCalled()
    expect(game.snapshot(north).view.legalActions.requiredDiscardCount).toBe(4)
    expect(game.snapshot(east).view.pendingDecision?.type).toBe('AWAITING_DISCARDS')
    const updates: GameUpdate[] = []
    game.subscribe(({ update }) => updates.push(update))
    expect(successData(game.submitHuman(north, requestFor(game, north,
      { type: 'DISCARD_RESOURCES', resources: { ...createEmptyResourceBag(), BRICK: 4 } }))).accepted).toBe(true)
    game.publish()
    expect(updates.find((update) => update.view.self.id === game.playerForSession(east))?.events)
      .toContainEqual(expect.objectContaining({ type: 'RESOURCES_DISCARDED', resources: null }))
    await game.advanceAi()
    expect(choose).toHaveBeenCalled()
    for (const [view, context] of choose.mock.calls) {
      expect(view.opponents.every((player) => !('resources' in player))).toBe(true)
      expect(context.previousCommandKeysThisTurn.some((key) => key.startsWith('DISCARD_RESOURCES'))).toBe(false)
    }
    expect(game.lifecycleStatus).toBe('ACTIVE')
  })

  it('keeps pending Invention private to the actor and stops AI at that boundary', async () => {
    const game = testSession(2, { createState: (config, seed) =>
      moveStandardCardToPlayer(actionFixture(config, seed), config.players[0].id, 'INVENTION') })
    const cardId = requireValue(game.snapshot(north).view.self.developmentCards[0]?.id)
    expect(successData(game.submitHuman(north, requestFor(game, north, { type: 'PLAY_DEVELOPMENT_CARD', cardId }))).accepted).toBe(true)
    await game.advanceAi()
    expect(game.snapshot(north).view.pendingDecision?.type).toBe('CHOOSE_INVENTION_RESOURCES')
    expect(game.snapshot(east).view.pendingDecision).toBeNull()
  })

  it('bounds AI work and reports safe failure without exposing agent errors', async () => {
    const game = testSession(2, {
      createState: (config, seed) => {
        const state = actionFixture(config, seed)
        return { ...state, turn: { ...state.turn, currentPlayerId: config.players[2].id } }
      },
      aiAgent: { chooseNextCommand: async () => { throw new Error('SECRET seed and stack') } },
    })
    await game.advanceAi()
    expect(game.snapshot(north)).toMatchObject({ lifecycleStatus: 'ERROR', aiThinking: false })
    expect(JSON.stringify(game.snapshot(north))).not.toContain('SECRET')
    expect(game.submitHuman(north, requestFor(game, north, { type: 'END_TURN' }))).toMatchObject({ ok: false, error: { code: 'GAME_UNAVAILABLE' } })
    const bounded = testSession(2, { maxAiCommandsPerAdvance: 1,
      createState: (config, seed) => {
        const state = actionFixture(config, seed)
        return { ...state, turn: { ...state.turn, currentPlayerId: config.players[2].id } }
      }, aiAgent: { chooseNextCommand: async () => ({ type: 'BUY_DEVELOPMENT_CARD' }) } })
    await bounded.advanceAi()
    expect(bounded.snapshot(north).lifecycleStatus).toBe('ERROR')
  })

  it('halts repeated legal AI commands at the explicit no-progress guard', async () => {
    let transitions = 0
    const game = testSession(2, {
      aiSafetyLimits: { maxCommandsPerTurn: 100, maxCommandsPerGame: 20_000, maxRepeatedCommandPerTurn: 1 },
      createState: (config, seed) => {
        const state = actionFixture(config, seed)
        return { ...state, turn: { ...state.turn, currentPlayerId: config.players[2].id } }
      },
      aiAgent: { chooseNextCommand: async () => ({ type: 'BUY_DEVELOPMENT_CARD' }) },
      afterTransition: () => { transitions += 1 },
    })
    await game.advanceAi()
    expect(transitions).toBe(1)
    expect(game.snapshot(north).lifecycleStatus).toBe('ERROR')
  })
})
