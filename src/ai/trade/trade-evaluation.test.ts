import type { GameState } from '../../game/model/game-state.ts'
import type { CommandId, PlayerId, TradeId } from '../../game/model/ids.ts'
import type { ResourceBag } from '../../game/model/resource.ts'
import type { TradeOffer } from '../../game/model/trade.ts'
import { gameEngine } from '../../game/engine/game-engine.ts'
import { GOLDEN_PLAYER_IDS } from '../../game/engine/task-05-golden-fixture.test-helper.ts'
import { createGoldenPaidBuildingStart } from '../../game/engine/task-08-paid-building.test-helper.ts'
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
})
