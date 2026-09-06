import type { GameState } from '@frontier-isles/game-core/model/game-state'
import type { CommandId, PlayerId, TradeId } from '@frontier-isles/game-core/model/ids'
import type { ResourceBag } from '@frontier-isles/game-core/model/resource'
import type { TradeOffer } from '@frontier-isles/game-core/model/trade'
import { gameEngine } from '@frontier-isles/game-core/engine/game-engine'
import { GOLDEN_PLAYER_IDS } from '@frontier-isles/game-core/engine/task-05-golden-fixture.test-helper'
import { createGoldenPaidBuildingStart } from '@frontier-isles/game-core/engine/task-08-paid-building.test-helper'
import {
  AI_PROFILES,
  type AiPersonalityProfile,
} from '../personalities/ai-profiles.ts'
import {
  createDeterministicCounterOffer,
  deriveMarginalResourceValues,
  evaluateTradeOffer,
  scoreTradeOffer,
} from './trade-evaluation.ts'

const EMPTY: ResourceBag = { LUMBER: 0, BRICK: 0, WOOL: 0, GRAIN: 0, ORE: 0 }

function rebalance(
  state: GameState,
  hands: Readonly<Record<PlayerId, ResourceBag>>,
): GameState {
  const totals: Record<keyof ResourceBag, number> = {
    LUMBER: 0,
    BRICK: 0,
    WOOL: 0,
    GRAIN: 0,
    ORE: 0,
  }
  const players = { ...state.players }
  for (const playerId of state.playerOrder) {
    const player = state.players[playerId]
    const resources = hands[playerId]
    if (player === undefined || resources === undefined) throw new Error(`Missing hand for ${playerId}.`)
    players[playerId] = { ...player, resources: { ...resources } }
    for (const resource of Object.keys(totals) as (keyof ResourceBag)[]) {
      totals[resource] += resources[resource]
    }
  }
  return {
    ...state,
    players,
    bank: {
      ...state.bank,
      resources: {
        LUMBER: 19 - totals.LUMBER,
        BRICK: 19 - totals.BRICK,
        WOOL: 19 - totals.WOOL,
        GRAIN: 19 - totals.GRAIN,
        ORE: 19 - totals.ORE,
      },
    },
  }
}

function actionState(human: ResourceBag, sentinel: ResourceBag): GameState {
  return rebalance(createGoldenPaidBuildingStart(), {
    [GOLDEN_PLAYER_IDS.sentinel]: sentinel,
    [GOLDEN_PLAYER_IDS.human]: human,
    [GOLDEN_PLAYER_IDS.merchant]: EMPTY,
    [GOLDEN_PLAYER_IDS.builder]: EMPTY,
  })
}

function offer(
  initiatorGives: ResourceBag,
  counterpartyGives: ResourceBag,
  tradeId = 'trade:ai-evaluation' as TradeId,
): TradeOffer {
  return {
    tradeId,
    initiatorId: GOLDEN_PLAYER_IDS.sentinel,
    counterpartyId: GOLDEN_PLAYER_IDS.human,
    proposedById: GOLDEN_PLAYER_IDS.sentinel,
    initiatorGives,
    counterpartyGives,
    parentTradeId: null,
  }
}

function responderView(state: GameState, terms: TradeOffer) {
  const proposal = gameEngine.execute(state, {
    commandId: 'command:trade-ai:test' as CommandId,
    actorId: GOLDEN_PLAYER_IDS.sentinel,
    expectedStateVersion: state.stateVersion,
    command: { type: 'PROPOSE_TRADE', offer: terms },
  })
  if (!proposal.ok) throw new Error(`Trade proposal failed: ${proposal.violation.code}.`)
  return gameEngine.createPlayerView(proposal.state, GOLDEN_PLAYER_IDS.human)
}

function aiCounterResponderView(
  state: GameState,
  initial: TradeOffer,
  initiatorGives: ResourceBag,
  counterpartyGives: ResourceBag,
): { readonly view: ReturnType<typeof gameEngine.createPlayerView>; readonly counter: TradeOffer } {
  const proposal = gameEngine.execute(state, {
    commandId: 'command:trade-ai:initial' as CommandId,
    actorId: GOLDEN_PLAYER_IDS.sentinel,
    expectedStateVersion: state.stateVersion,
    command: { type: 'PROPOSE_TRADE', offer: initial },
  })
  if (!proposal.ok) throw new Error(`Trade proposal failed: ${proposal.violation.code}.`)
  const counter: TradeOffer = {
    ...initial,
    tradeId: 'trade:ai-evaluation:human-counter' as TradeId,
    proposedById: GOLDEN_PLAYER_IDS.human,
    parentTradeId: initial.tradeId,
    initiatorGives,
    counterpartyGives,
  }
  const result = gameEngine.execute(proposal.state, {
    commandId: 'command:trade-ai:counter' as CommandId,
    actorId: GOLDEN_PLAYER_IDS.human,
    expectedStateVersion: proposal.state.stateVersion,
    command: { type: 'COUNTER_TRADE', previousTradeId: initial.tradeId, offer: counter },
  })
  if (!result.ok) throw new Error(`Human counter failed: ${result.violation.code}.`)
  return {
    view: gameEngine.createPlayerView(result.state, GOLDEN_PLAYER_IDS.sentinel),
    counter,
  }
}

describe('trade AI evaluation', () => {
  it('accepts a one-for-one offer that immediately unlocks a settlement', () => {
    const state = actionState(
      { ...EMPTY, BRICK: 2, WOOL: 1, GRAIN: 1 },
      { ...EMPTY, LUMBER: 2 },
    )
    const terms = offer({ ...EMPTY, LUMBER: 1 }, { ...EMPTY, BRICK: 1 })
    const view = responderView(state, terms)
    const breakdown = scoreTradeOffer(view, terms, AI_PROFILES.MERCHANT)

    expect(breakdown.buildUnlock).toBeGreaterThan(0)
    expect(evaluateTradeOffer(view, terms, AI_PROFILES.MERCHANT, 0).type).toBe('ACCEPT')
  })

  it('rejects giving away a critical city resource for weak compensation', () => {
    const state = actionState(
      { ...EMPTY, GRAIN: 2, ORE: 3 },
      { ...EMPTY, LUMBER: 2 },
    )
    const terms = offer({ ...EMPTY, LUMBER: 1 }, { ...EMPTY, ORE: 1 })
    const view = responderView(state, terms)

    expect(evaluateTradeOffer(view, terms, AI_PROFILES.SENTINEL, 1).type).toBe('REJECT')
  })

  it('rejects an otherwise useful trade when the visible opponent is at nine points', () => {
    const state = actionState(
      { ...EMPTY, BRICK: 2, WOOL: 1, GRAIN: 1 },
      { ...EMPTY, LUMBER: 2 },
    )
    const terms = offer({ ...EMPTY, LUMBER: 1 }, { ...EMPTY, BRICK: 1 })
    const baseView = responderView(state, terms)
    const view = {
      ...baseView,
      opponents: baseView.opponents.map((opponent) => opponent.id === GOLDEN_PLAYER_IDS.sentinel
        ? { ...opponent, publicVictoryPoints: 9 }
        : opponent),
    }

    expect(evaluateTradeOffer(view, terms, AI_PROFILES.SENTINEL, 0)).toMatchObject({
      type: 'REJECT',
      reasonCode: 'HELPS_LEADER_TOO_MUCH',
    })
  })

  it('creates one deterministic minimal counter without reading the initiator hand', () => {
    const state = actionState(
      { ...EMPTY, BRICK: 2, WOOL: 1 },
      { ...EMPTY, LUMBER: 2 },
    )
    const terms = offer({ ...EMPTY, LUMBER: 1 }, { ...EMPTY, BRICK: 1 })
    const view = responderView(state, terms)
    const counterProfile: AiPersonalityProfile = {
      ...AI_PROFILES.MERCHANT,
      acceptanceThreshold: 1_000,
      counterThreshold: -1_000,
    }
    expect(evaluateTradeOffer(view, terms, counterProfile, 0).type).toBe('COUNTER')
    const counter = createDeterministicCounterOffer(
      view,
      terms,
      counterProfile,
      'trade:ai-evaluation:counter' as TradeId,
    )

    expect(counter).not.toBeNull()
    expect(counter?.parentTradeId).toBe(terms.tradeId)
    expect(counter?.proposedById).toBe(GOLDEN_PLAYER_IDS.human)
    const added = (Object.keys(EMPTY) as (keyof ResourceBag)[]).reduce(
      (total, resource) => total
        + ((counter?.initiatorGives[resource] ?? 0) - terms.initiatorGives[resource]),
      0,
    )
    expect(added).toBe(1)
  })

  it('changes visible marginal values with controlled-port and personality weights', () => {
    const state = actionState(
      { ...EMPTY, BRICK: 2, WOOL: 1, GRAIN: 1 },
      { ...EMPTY, LUMBER: 2 },
    )
    const terms = offer({ ...EMPTY, LUMBER: 1 }, { ...EMPTY, BRICK: 1 })
    const view = responderView(state, terms)
    const merchant = deriveMarginalResourceValues(view, AI_PROFILES.MERCHANT)
    const sentinel = deriveMarginalResourceValues(view, AI_PROFILES.SENTINEL)

    expect(merchant).not.toEqual(sentinel)
    expect(scoreTradeOffer(view, terms, AI_PROFILES.MERCHANT).total)
      .not.toBe(scoreTradeOffer(view, terms, AI_PROFILES.SENTINEL).total)
  })

  it('accepts a clearly favorable complete Human counter as the AI initiator', () => {
    const state = actionState(
      { ...EMPTY, BRICK: 2, GRAIN: 1 },
      { ...EMPTY, LUMBER: 2, WOOL: 1 },
    )
    const initial = offer({ ...EMPTY, LUMBER: 1 }, { ...EMPTY, BRICK: 1 })
    const { view, counter } = aiCounterResponderView(
      state,
      initial,
      { ...EMPTY, LUMBER: 1 },
      { ...EMPTY, BRICK: 2 },
    )

    expect(view.pendingDecision).toMatchObject({
      type: 'RESPOND_TO_TRADE',
      counterDepth: 1,
      offer: counter,
    })
    expect(evaluateTradeOffer(view, counter, AI_PROFILES.SENTINEL, 1)).toMatchObject({
      type: 'ACCEPT',
      reasonCode: 'ACCEPTABLE_VALUE',
    })
  })

  it('rejects a clearly unfavorable complete Human counter', () => {
    const state = actionState(
      { ...EMPTY, BRICK: 2, GRAIN: 1 },
      { ...EMPTY, LUMBER: 2, WOOL: 1 },
    )
    const initial = offer({ ...EMPTY, LUMBER: 1 }, { ...EMPTY, BRICK: 1 })
    const { view, counter } = aiCounterResponderView(
      state,
      initial,
      { ...EMPTY, LUMBER: 2, WOOL: 1 },
      { ...EMPTY, BRICK: 1 },
    )

    expect(evaluateTradeOffer(view, counter, AI_PROFILES.SENTINEL, 1)).toMatchObject({
      type: 'REJECT',
      reasonCode: 'NOT_ENOUGH_VALUE',
    })
  })

  it('rejects an unaffordable request without inspecting or describing another hand', () => {
    const state = actionState(
      { ...EMPTY, BRICK: 2, GRAIN: 1 },
      { ...EMPTY, LUMBER: 2, WOOL: 1 },
    )
    const initial = offer({ ...EMPTY, LUMBER: 1 }, { ...EMPTY, BRICK: 1 })
    const { view, counter } = aiCounterResponderView(
      state,
      initial,
      { ...EMPTY, ORE: 1 },
      { ...EMPTY, BRICK: 1 },
    )

    expect(evaluateTradeOffer(view, counter, AI_PROFILES.SENTINEL, 1)).toEqual({
      type: 'REJECT',
      score: Number.NEGATIVE_INFINITY,
      reasonCode: 'CANNOT_AFFORD',
    })
    expect(view.pendingDecision).toMatchObject({ type: 'RESPOND_TO_TRADE', offer: counter })
  })

  it('allows deterministic profile differences on the same depth-one counter', () => {
    const state = actionState(
      { ...EMPTY, BRICK: 2, GRAIN: 1 },
      { ...EMPTY, LUMBER: 2, WOOL: 1 },
    )
    const initial = offer({ ...EMPTY, LUMBER: 1 }, { ...EMPTY, BRICK: 1 })
    const { view, counter } = aiCounterResponderView(
      state,
      initial,
      { ...EMPTY, LUMBER: 2 },
      { ...EMPTY, BRICK: 2 },
    )

    expect(evaluateTradeOffer(view, counter, AI_PROFILES.MERCHANT, 1).type).toBe('ACCEPT')
    expect(evaluateTradeOffer(view, counter, AI_PROFILES.BUILDER, 1).type).toBe('ACCEPT')
    expect(evaluateTradeOffer(view, counter, AI_PROFILES.SENTINEL, 1).type).toBe('REJECT')
    expect(evaluateTradeOffer(view, counter, AI_PROFILES.SENTINEL, 1))
      .toEqual(evaluateTradeOffer(view, counter, AI_PROFILES.SENTINEL, 1))
  })
})
