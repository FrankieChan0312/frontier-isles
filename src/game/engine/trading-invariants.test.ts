import type { GameState } from '../model/game-state.ts'
import type { PlayerId, TradeId } from '../model/ids.ts'
import {
  createGoldenCounterOffer,
  createGoldenDomesticTradeStart,
  createInitialGoldenOffer,
  EMPTY_TRADE_BAG,
} from './task-11-trading.test-helper.ts'
import { GOLDEN_PLAYER_IDS } from './task-05-golden-fixture.test-helper.ts'
import { executeTradingCommand } from './trading-engine.ts'
import { assertTradingState } from './trading-invariants.ts'

function propose(state = createGoldenDomesticTradeStart()): GameState {
  const result = executeTradingCommand(state, {
    commandId: 'command:task-11:invariant:proposal' as never,
    actorId: GOLDEN_PLAYER_IDS.sentinel,
    expectedStateVersion: state.stateVersion,
    command: { type: 'PROPOSE_TRADE', offer: createInitialGoldenOffer() },
  })
  if (!result.ok) throw new Error(`Invariant proposal failed: ${result.violation.code}.`)
  return result.state
}

function counter(state = propose()): GameState {
  const result = executeTradingCommand(state, {
    commandId: 'command:task-11:invariant:counter' as never,
    actorId: GOLDEN_PLAYER_IDS.human,
    expectedStateVersion: state.stateVersion,
    command: {
      type: 'COUNTER_TRADE',
      previousTradeId: 'trade:task-11:initial' as TradeId,
      offer: createGoldenCounterOffer(),
    },
  })
  if (!result.ok) throw new Error(`Invariant counter failed: ${result.violation.code}.`)
  return result.state
}

describe('Task 11 trading invariants', () => {
  it('accepts initial and counter pending states without mutation or hidden responder checks', () => {
    const base = createGoldenDomesticTradeStart()
    const human = base.players[GOLDEN_PLAYER_IDS.human]
    if (human === undefined) throw new Error('Missing Human.')
    const hiddenShortage: GameState = {
      ...base,
      players: { ...base.players, [GOLDEN_PLAYER_IDS.human]: {
        ...human, resources: { ...human.resources, BRICK: 0 },
      } },
      bank: { ...base.bank, resources: { ...base.bank.resources, BRICK: 19 } },
    }
    const initial = propose(hiddenShortage)
    const initialSnapshot = structuredClone(initial)
    expect(() => assertTradingState(initial)).not.toThrow()
    expect(initial).toEqual(initialSnapshot)
    const countered = counter()
    expect(() => assertTradingState(countered)).not.toThrow()
    expect(JSON.parse(JSON.stringify(countered))).toEqual(countered)
  })

  it('rejects phase, current-player, unknown-party, proposer, and responder corruption', () => {
    const state = propose()
    const pending = state.pendingDecision
    if (pending?.type !== 'RESPOND_TO_TRADE') throw new Error('Missing trade pending fixture.')
    const corruptions: readonly GameState[] = [
      { ...state, turn: { ...state.turn, phase: 'ROLL_REQUIRED', lastRoll: null } },
      { ...state, turn: { ...state.turn, currentPlayerId: GOLDEN_PLAYER_IDS.human } },
      { ...state, pendingDecision: { ...pending, responderId: GOLDEN_PLAYER_IDS.merchant } },
      { ...state, pendingDecision: { ...pending, offer: {
        ...pending.offer, counterpartyId: 'player:unknown' as PlayerId,
      } } },
      { ...state, pendingDecision: { ...pending, offer: {
        ...pending.offer, proposedById: GOLDEN_PLAYER_IDS.human,
      } } },
    ]
    for (const corrupted of corruptions) {
      expect(() => assertTradingState(corrupted)).toThrow()
    }
  })

  it('rejects invalid depth/lineage, empty bundles, overlap, and proposer shortage', () => {
    const state = propose()
    const pending = state.pendingDecision
    const sentinel = state.players[GOLDEN_PLAYER_IDS.sentinel]
    if (pending?.type !== 'RESPOND_TO_TRADE' || sentinel === undefined) {
      throw new Error('Missing invariant fixture data.')
    }
    expect(() => assertTradingState({
      ...state,
      pendingDecision: { ...pending, counterDepth: 1 },
    })).toThrow(/parent|countered/)
    expect(() => assertTradingState({
      ...state,
      pendingDecision: { ...pending, offer: {
        ...pending.offer, initiatorGives: EMPTY_TRADE_BAG,
      } },
    })).toThrow(/bundles/)
    expect(() => assertTradingState({
      ...state,
      pendingDecision: { ...pending, offer: {
        ...pending.offer,
        counterpartyGives: { ...pending.offer.counterpartyGives, LUMBER: 1 },
      } },
    })).toThrow(/overlap/)
    expect(() => assertTradingState({
      ...state,
      players: { ...state.players, [GOLDEN_PLAYER_IDS.sentinel]: {
        ...sentinel, resources: { ...sentinel.resources, LUMBER: 0 },
      } },
      bank: { ...state.bank, resources: { ...state.bank.resources, LUMBER: 19 } },
    })).toThrow(/proposer cannot provide/)
  })

  it('inherits topology, occupancy-owner, resource-conservation, and card-state corruption checks', () => {
    const state = createGoldenDomesticTradeStart()
    const port = Object.values(state.board.topology.ports)[0]
    if (port === undefined) throw new Error('Missing port.')
    expect(() => assertTradingState({
      ...state,
      board: { ...state.board, topology: {
        ...state.board.topology,
        ports: { ...state.board.topology.ports, [port.id]: { ...port, edgeId: 'edge:unknown' as never } },
      } },
    })).toThrow(/port|edge/i)
    expect(() => assertTradingState({
      ...state,
      board: { ...state.board, vertexOccupancy: {
        ...state.board.vertexOccupancy,
        ['vertex:-1,-1,2' as never]: { type: 'SETTLEMENT', ownerId: 'player:unknown' as PlayerId },
      } },
    })).toThrow(/unknown/i)
    expect(() => assertTradingState({
      ...state,
      bank: { ...state.bank, resources: { ...state.bank.resources, ORE: 18 } },
    })).toThrow(/total must equal 19/)
    expect(() => assertTradingState({
      ...state,
      bank: { ...state.bank, developmentDeck: state.bank.developmentDeck.slice(1) },
    })).toThrow(/development-card total/)
  })
})
