import type { GameState } from '../model/game-state.ts'
import type { CommandId, PlayerId, TradeId } from '../model/ids.ts'
import type { ResourceBag } from '../model/resource.ts'
import type { TradeOffer } from '../model/trade.ts'
import { executeNormalTurnLifecycleCommand } from './normal-turn-lifecycle-engine.ts'
import type { NormalTurnLifecycleCommand } from './normal-turn-lifecycle-engine.ts'
import {
  createCompletedGoldenSetup,
  GOLDEN_PLAYER_IDS,
} from './task-05-golden-fixture.test-helper.ts'
import { createGoldenPaidBuildingStart } from './task-08-paid-building.test-helper.ts'

export const EMPTY_TRADE_BAG: ResourceBag = Object.freeze({
  LUMBER: 0,
  BRICK: 0,
  WOOL: 0,
  GRAIN: 0,
  ORE: 0,
})

function rebalance(
  state: GameState,
  hands: Readonly<Record<PlayerId, ResourceBag>>,
  bankResources: ResourceBag,
): GameState {
  const players = Object.fromEntries(state.playerOrder.map((playerId) => {
    const player = state.players[playerId]
    const resources = hands[playerId]
    if (player === undefined || resources === undefined) throw new Error(`Missing trade fixture data for ${playerId}.`)
    return [playerId, { ...player, resources: { ...resources } }]
  })) as GameState['players']
  return { ...state, players, bank: { ...state.bank, resources: { ...bankResources } } }
}

export function createGoldenDomesticTradeStart(): GameState {
  return rebalance(createGoldenPaidBuildingStart(), {
    [GOLDEN_PLAYER_IDS.sentinel]: { ...EMPTY_TRADE_BAG, LUMBER: 2, WOOL: 1 },
    [GOLDEN_PLAYER_IDS.human]: { ...EMPTY_TRADE_BAG, BRICK: 2, GRAIN: 1 },
    [GOLDEN_PLAYER_IDS.merchant]: EMPTY_TRADE_BAG,
    [GOLDEN_PLAYER_IDS.builder]: EMPTY_TRADE_BAG,
  }, { LUMBER: 17, BRICK: 17, WOOL: 18, GRAIN: 18, ORE: 19 })
}

export function createInitialGoldenOffer(): TradeOffer {
  return {
    tradeId: 'trade:task-11:initial' as TradeId,
    initiatorId: GOLDEN_PLAYER_IDS.sentinel,
    counterpartyId: GOLDEN_PLAYER_IDS.human,
    proposedById: GOLDEN_PLAYER_IDS.sentinel,
    parentTradeId: null,
    initiatorGives: { ...EMPTY_TRADE_BAG, LUMBER: 1 },
    counterpartyGives: { ...EMPTY_TRADE_BAG, BRICK: 1 },
  }
}

export function createGoldenCounterOffer(): TradeOffer {
  return {
    tradeId: 'trade:task-11:counter' as TradeId,
    initiatorId: GOLDEN_PLAYER_IDS.sentinel,
    counterpartyId: GOLDEN_PLAYER_IDS.human,
    proposedById: GOLDEN_PLAYER_IDS.human,
    parentTradeId: 'trade:task-11:initial' as TradeId,
    initiatorGives: { ...EMPTY_TRADE_BAG, LUMBER: 1, WOOL: 1 },
    counterpartyGives: { ...EMPTY_TRADE_BAG, BRICK: 2 },
  }
}

function lifecycle(
  state: GameState,
  actorId: PlayerId,
  command: NormalTurnLifecycleCommand,
): GameState {
  const result = executeNormalTurnLifecycleCommand(state, {
    commandId: `command:task-11:lifecycle:${state.stateVersion}` as CommandId,
    actorId,
    expectedStateVersion: state.stateVersion,
    command,
  })
  if (!result.ok) throw new Error(`Task 11 lifecycle fixture failed: ${result.violation.code}.`)
  return result.state
}

export function createGoldenMaritimeTradeStart(): GameState {
  let state = createCompletedGoldenSetup()
  state = lifecycle(state, GOLDEN_PLAYER_IDS.sentinel, { type: 'ROLL_DICE' })
  state = lifecycle(state, GOLDEN_PLAYER_IDS.sentinel, { type: 'END_TURN' })
  state = lifecycle(state, GOLDEN_PLAYER_IDS.human, { type: 'ROLL_DICE' })
  state = lifecycle(state, GOLDEN_PLAYER_IDS.human, { type: 'END_TURN' })
  state = lifecycle(state, GOLDEN_PLAYER_IDS.merchant, { type: 'ROLL_DICE' })
  return rebalance(state, {
    [GOLDEN_PLAYER_IDS.sentinel]: EMPTY_TRADE_BAG,
    [GOLDEN_PLAYER_IDS.human]: EMPTY_TRADE_BAG,
    [GOLDEN_PLAYER_IDS.merchant]: { ...EMPTY_TRADE_BAG, BRICK: 3 },
    [GOLDEN_PLAYER_IDS.builder]: EMPTY_TRADE_BAG,
  }, { LUMBER: 19, BRICK: 16, WOOL: 19, GRAIN: 19, ORE: 19 })
}
