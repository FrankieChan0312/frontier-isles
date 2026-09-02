import { expectTypeOf } from 'vitest'
import type { CommandEnvelope, GameCommand } from '../contracts/commands.ts'
import type { GameEvent } from '../contracts/events.ts'
import type { GameState } from '../model/game-state.ts'
import type { CommandId, PlayerId, TradeId } from '../model/ids.ts'
import type { ResourceBag } from '../model/resource.ts'
import { moveStandardCardToPlayer } from './task-10-development-card.test-helper.ts'
import {
  createGoldenCounterOffer,
  createGoldenDomesticTradeStart,
  createGoldenMaritimeTradeStart,
  createInitialGoldenOffer,
  EMPTY_TRADE_BAG,
} from './task-11-trading.test-helper.ts'
import { GOLDEN_PLAYER_IDS, createCompletedGoldenSetup } from './task-05-golden-fixture.test-helper.ts'
import {
  executeTradingCommand,
  type TradingCommand,
  type TradingCommandEnvelope,
} from './trading-engine.ts'

function envelope(
  state: GameState,
  command: TradingCommand,
  actorId: PlayerId = state.turn.currentPlayerId,
): TradingCommandEnvelope {
  return {
    commandId: `command:task-11:${state.stateVersion}:${command.type}` as CommandId,
    actorId,
    expectedStateVersion: state.stateVersion,
    command,
  }
}

function success(
  state: GameState,
  command: TradingCommand,
  actorId: PlayerId = state.turn.currentPlayerId,
): { readonly state: GameState; readonly events: readonly GameEvent[] } {
  const result = executeTradingCommand(state, envelope(state, command, actorId))
  if (!result.ok) throw new Error(`Task 11 command failed: ${result.violation.code}.`)
  return result
}

function violation(
  state: GameState,
  command: TradingCommand,
  actorId: PlayerId = state.turn.currentPlayerId,
): string | null {
  const result = executeTradingCommand(state, envelope(state, command, actorId))
  return result.ok ? null : result.violation.code
}

function proposedState(state = createGoldenDomesticTradeStart()): GameState {
  return success(state, { type: 'PROPOSE_TRADE', offer: createInitialGoldenOffer() }).state
}

describe('Task 11 trading engine', () => {
  it('exports the exact narrow Task 11 command boundary', () => {
    expectTypeOf<TradingCommand>().toEqualTypeOf<Extract<
      GameCommand,
      | { readonly type: 'PROPOSE_TRADE' }
      | { readonly type: 'ACCEPT_TRADE' }
      | { readonly type: 'REJECT_TRADE' }
      | { readonly type: 'COUNTER_TRADE' }
      | { readonly type: 'MARITIME_TRADE' }
    >>()
    expectTypeOf<TradingCommandEnvelope>().toEqualTypeOf<
      Omit<CommandEnvelope, 'command'> & { readonly command: TradingCommand }
    >()
  })

  it('matches the exact three-command domestic golden replay', () => {
    let state = createGoldenDomesticTradeStart()
    const initialResources = structuredClone(state.players)
    const random = state.random
    const bank = state.bank
    const events: GameEvent[] = []
    let result = success(state, { type: 'PROPOSE_TRADE', offer: createInitialGoldenOffer() })
    state = result.state
    events.push(...result.events)
    expect(state.stateVersion).toBe(18)
    expect(state.pendingDecision).toEqual({
      type: 'RESPOND_TO_TRADE',
      responderId: GOLDEN_PLAYER_IDS.human,
      offer: createInitialGoldenOffer(),
      counterDepth: 0,
    })
    expect(state.players).toEqual(initialResources)

    result = success(state, {
      type: 'COUNTER_TRADE',
      previousTradeId: 'trade:task-11:initial' as TradeId,
      offer: createGoldenCounterOffer(),
    }, GOLDEN_PLAYER_IDS.human)
    state = result.state
    events.push(...result.events)
    expect(state.stateVersion).toBe(19)
    expect(state.pendingDecision).toMatchObject({
      type: 'RESPOND_TO_TRADE',
      responderId: GOLDEN_PLAYER_IDS.sentinel,
      counterDepth: 1,
    })
    expect(state.players).toEqual(initialResources)

    result = success(state, {
      type: 'ACCEPT_TRADE', tradeId: 'trade:task-11:counter' as TradeId,
    }, GOLDEN_PLAYER_IDS.sentinel)
    state = result.state
    events.push(...result.events)
    expect(state).toMatchObject({
      stateVersion: 20,
      pendingDecision: null,
      turn: { phase: 'ACTION', currentPlayerId: GOLDEN_PLAYER_IDS.sentinel },
      random: { state: 1264537981, drawCount: 86 },
    })
    expect(state.players[GOLDEN_PLAYER_IDS.sentinel]?.resources).toEqual({
      LUMBER: 1, BRICK: 2, WOOL: 0, GRAIN: 0, ORE: 0,
    })
    expect(state.players[GOLDEN_PLAYER_IDS.human]?.resources).toEqual({
      LUMBER: 1, BRICK: 0, WOOL: 1, GRAIN: 1, ORE: 0,
    })
    expect(state.bank).toBe(bank)
    expect(state.random).toBe(random)
    expect(events.map((event) => event.type)).toEqual([
      'TRADE_PROPOSED', 'TRADE_COUNTERED', 'TRADE_COMPLETED',
    ])
  })

  it('validates only the initial proposer hand and does not reveal counterparty shortage', () => {
    const base = createGoldenDomesticTradeStart()
    const human = base.players[GOLDEN_PLAYER_IDS.human]
    if (human === undefined) throw new Error('Missing Human.')
    const state: GameState = {
      ...base,
      players: { ...base.players, [GOLDEN_PLAYER_IDS.human]: {
        ...human, resources: { ...human.resources, BRICK: 0 },
      } },
      bank: { ...base.bank, resources: { ...base.bank.resources, BRICK: 19 } },
    }
    expect(violation(state, {
      type: 'PROPOSE_TRADE', offer: createInitialGoldenOffer(),
    })).toBeNull()
  })

  it('enforces initial parties, complete positive bundles, overlap, and proposer availability', () => {
    const state = createGoldenDomesticTradeStart()
    const offer = createInitialGoldenOffer()
    for (const invalid of [
      { ...offer, counterpartyId: offer.initiatorId },
      { ...offer, initiatorId: GOLDEN_PLAYER_IDS.human },
      { ...offer, proposedById: GOLDEN_PLAYER_IDS.human },
      { ...offer, parentTradeId: 'trade:parent' as TradeId },
      { ...offer, counterpartyId: 'player:unknown' as PlayerId },
      { ...offer, tradeId: '' as TradeId },
    ]) expect(violation(state, { type: 'PROPOSE_TRADE', offer: invalid })).toBe('TRADE_PARTY_MISMATCH')

    for (const initiatorGives of [
      { LUMBER: 1 } as unknown as ResourceBag,
      { ...EMPTY_TRADE_BAG, LUMBER: -1 },
      { ...EMPTY_TRADE_BAG, LUMBER: 0.5 },
      { ...EMPTY_TRADE_BAG, EXTRA: 1 } as unknown as ResourceBag,
      EMPTY_TRADE_BAG,
    ]) {
      expect(violation(state, { type: 'PROPOSE_TRADE', offer: {
        ...offer, initiatorGives,
      } })).toBe('INVALID_TRADE_OFFER')
    }
    expect(violation(state, { type: 'PROPOSE_TRADE', offer: {
      ...offer, counterpartyGives: EMPTY_TRADE_BAG,
    } })).toBe('INVALID_TRADE_OFFER')
    expect(violation(state, { type: 'PROPOSE_TRADE', offer: {
      ...offer, counterpartyGives: { ...offer.counterpartyGives, LUMBER: 1 },
    } })).toBe('SAME_RESOURCE_TRADE')
    expect(violation(state, { type: 'PROPOSE_TRADE', offer: {
      ...offer, initiatorGives: { ...EMPTY_TRADE_BAG, LUMBER: 3 },
    } })).toBe('TRADE_RESOURCE_UNAVAILABLE')
  })

  it('applies exact initiation precedence and preserves failed inputs', () => {
    const state = createGoldenDomesticTradeStart()
    const command = envelope(state, { type: 'PROPOSE_TRADE', offer: createInitialGoldenOffer() })
    const snapshot = structuredClone({ state, command })
    expect(executeTradingCommand(state, { ...command, expectedStateVersion: 999 }).ok).toBe(false)
    expect(violation(state, command.command, 'player:unknown' as PlayerId)).toBe('UNKNOWN_ACTOR')
    expect(violation(state, command.command, GOLDEN_PLAYER_IDS.human)).toBe('NOT_YOUR_TURN')
    const beforeRoll = createCompletedGoldenSetup()
    expect(violation(beforeRoll, command.command)).toBe('WRONG_PHASE')
    expect(state).toEqual(snapshot.state)
    expect(command).toEqual(snapshot.command)
  })

  it('lets the exact non-current responder reject without revalidating resources', () => {
    const state = proposedState()
    const resources = state.players
    const result = success(state, {
      type: 'REJECT_TRADE', tradeId: 'trade:task-11:initial' as TradeId,
    }, GOLDEN_PLAYER_IDS.human)
    expect(result.state.pendingDecision).toBeNull()
    expect(result.state.players).toBe(resources)
    expect(result.events).toEqual([{
      type: 'TRADE_REJECTED',
      tradeId: 'trade:task-11:initial',
      rejectedById: GOLDEN_PLAYER_IDS.human,
    }])
  })

  it('enforces response pending ID, responder, and pending-kind precedence', () => {
    const base = createGoldenDomesticTradeStart()
    expect(violation(base, {
      type: 'ACCEPT_TRADE', tradeId: 'trade:task-11:initial' as TradeId,
    }, GOLDEN_PLAYER_IDS.human)).toBe('TRADE_NOT_PENDING')
    const state = proposedState(base)
    expect(violation(state, {
      type: 'ACCEPT_TRADE', tradeId: 'trade:wrong' as TradeId,
    }, GOLDEN_PLAYER_IDS.human)).toBe('TRADE_NOT_PENDING')
    expect(violation(state, {
      type: 'ACCEPT_TRADE', tradeId: 'trade:task-11:initial' as TradeId,
    }, GOLDEN_PLAYER_IDS.merchant)).toBe('TRADE_PARTY_MISMATCH')

    let otherPending = moveStandardCardToPlayer(base, GOLDEN_PLAYER_IDS.sentinel, 'MONOPOLY', 'PLAYED', 0)
    const cardId = otherPending.players[GOLDEN_PLAYER_IDS.sentinel]?.developmentCards[0]?.id
    if (cardId === undefined) throw new Error('Missing pending fixture card.')
    otherPending = { ...otherPending, pendingDecision: {
      type: 'CHOOSE_MONOPOLY_RESOURCE', actingPlayerId: GOLDEN_PLAYER_IDS.sentinel, cardId,
    } }
    expect(violation(otherPending, {
      type: 'ACCEPT_TRADE', tradeId: 'trade:task-11:initial' as TradeId,
    }, GOLDEN_PLAYER_IDS.human)).toBe('PENDING_DECISION_REQUIRED')
  })

  it('validates counter lineage, one-counter depth, and only the counter-proposer hand', () => {
    let state = proposedState()
    const hiddenShortage = {
      ...createGoldenCounterOffer(),
      initiatorGives: { ...EMPTY_TRADE_BAG, LUMBER: 3 },
      counterpartyGives: { ...EMPTY_TRADE_BAG, BRICK: 1 },
    }
    const counter = success(state, {
      type: 'COUNTER_TRADE',
      previousTradeId: 'trade:task-11:initial' as TradeId,
      offer: hiddenShortage,
    }, GOLDEN_PLAYER_IDS.human)
    state = counter.state
    expect(state.pendingDecision).toMatchObject({ counterDepth: 1, responderId: GOLDEN_PLAYER_IDS.sentinel })
    expect(violation(state, {
      type: 'COUNTER_TRADE',
      previousTradeId: hiddenShortage.tradeId,
      offer: { ...hiddenShortage, tradeId: 'trade:second' as TradeId, parentTradeId: hiddenShortage.tradeId },
    }, GOLDEN_PLAYER_IDS.sentinel)).toBe('TRADE_NOT_ALLOWED')

    const initial = proposedState()
    for (const offer of [
      { ...createGoldenCounterOffer(), parentTradeId: null },
      { ...createGoldenCounterOffer(), proposedById: GOLDEN_PLAYER_IDS.sentinel },
      { ...createGoldenCounterOffer(), initiatorId: GOLDEN_PLAYER_IDS.human },
      { ...createGoldenCounterOffer(), counterpartyId: GOLDEN_PLAYER_IDS.merchant },
      { ...createGoldenCounterOffer(), tradeId: 'trade:task-11:initial' as TradeId },
    ]) {
      expect(violation(initial, {
        type: 'COUNTER_TRADE',
        previousTradeId: 'trade:task-11:initial' as TradeId,
        offer,
      }, GOLDEN_PLAYER_IDS.human)).toBe('TRADE_PARTY_MISMATCH')
    }
    expect(violation(initial, {
      type: 'COUNTER_TRADE',
      previousTradeId: 'trade:task-11:initial' as TradeId,
      offer: {
        ...createGoldenCounterOffer(),
        counterpartyGives: { ...EMPTY_TRADE_BAG, BRICK: 3 },
      },
    }, GOLDEN_PLAYER_IDS.human)).toBe('TRADE_RESOURCE_UNAVAILABLE')
    expect(violation(initial, {
      type: 'COUNTER_TRADE',
      previousTradeId: 'trade:task-11:initial' as TradeId,
      offer: {
        ...createGoldenCounterOffer(),
        counterpartyGives: { ...EMPTY_TRADE_BAG, LUMBER: 1 },
      },
    }, GOLDEN_PLAYER_IDS.human)).toBe('SAME_RESOURCE_TRADE')

    const hiddenSnapshot = structuredClone(state)
    expect(violation(state, {
      type: 'ACCEPT_TRADE', tradeId: hiddenShortage.tradeId,
    }, GOLDEN_PLAYER_IDS.sentinel)).toBe('TRADE_RESOURCE_UNAVAILABLE')
    expect(state).toEqual(hiddenSnapshot)
  })

  it('fails acceptance atomically when the non-proposing party cannot pay', () => {
    const state = proposedState(createGoldenDomesticTradeStart())
    const pending = state.pendingDecision
    const snapshot = structuredClone(state)
    expect(violation(state, {
      type: 'ACCEPT_TRADE', tradeId: 'trade:task-11:initial' as TradeId,
    }, GOLDEN_PLAYER_IDS.human)).toBeNull()

    const base = createGoldenDomesticTradeStart()
    const human = base.players[GOLDEN_PLAYER_IDS.human]
    if (human === undefined) throw new Error('Missing Human.')
    const short = proposedState({
      ...base,
      players: { ...base.players, [GOLDEN_PLAYER_IDS.human]: {
        ...human, resources: { ...human.resources, BRICK: 0 },
      } },
      bank: { ...base.bank, resources: { ...base.bank.resources, BRICK: 19 } },
    })
    const shortSnapshot = structuredClone(short)
    expect(violation(short, {
      type: 'ACCEPT_TRADE', tradeId: 'trade:task-11:initial' as TradeId,
    }, GOLDEN_PLAYER_IDS.human)).toBe('TRADE_RESOURCE_UNAVAILABLE')
    expect(short).toEqual(shortSnapshot)
    expect(short.pendingDecision).toEqual(shortSnapshot.pendingDecision)
    expect(pending).toEqual(snapshot.pendingDecision)
  })

  it('matches the exact Merchant generic-port maritime golden replay', () => {
    const state = createGoldenMaritimeTradeStart()
    const random = state.random
    expect(state).toMatchObject({
      stateVersion: 21,
      turn: {
        turnNumber: 3,
        currentPlayerId: GOLDEN_PLAYER_IDS.merchant,
        phase: 'ACTION',
        lastRoll: { dice: [5, 4], total: 9 },
      },
      random: { state: 2261670735, drawCount: 90 },
    })
    const result = success(state, {
      type: 'MARITIME_TRADE', giveResource: 'BRICK', receiveResource: 'ORE',
    }, GOLDEN_PLAYER_IDS.merchant)
    expect(result.state.stateVersion).toBe(22)
    expect(result.state.players[GOLDEN_PLAYER_IDS.merchant]?.resources).toEqual({
      LUMBER: 0, BRICK: 0, WOOL: 0, GRAIN: 0, ORE: 1,
    })
    expect(result.state.bank.resources).toEqual({
      LUMBER: 19, BRICK: 19, WOOL: 19, GRAIN: 19, ORE: 18,
    })
    expect(result.state.random).toBe(random)
    expect(result.events).toEqual([{
      type: 'MARITIME_TRADE_COMPLETED',
      playerId: GOLDEN_PLAYER_IDS.merchant,
      giveResource: 'BRICK',
      receiveResource: 'ORE',
      ratio: 3,
    }])
  })

  it('validates maritime overlap, give supply, bank supply, and repeated trades', () => {
    const base = createGoldenMaritimeTradeStart()
    expect(violation(base, {
      type: 'MARITIME_TRADE', giveResource: 'BRICK', receiveResource: 'BRICK',
    }, GOLDEN_PLAYER_IDS.merchant)).toBe('SAME_RESOURCE_TRADE')
    const merchant = base.players[GOLDEN_PLAYER_IDS.merchant]
    if (merchant === undefined) throw new Error('Missing Merchant.')
    const poor: GameState = {
      ...base,
      players: { ...base.players, [GOLDEN_PLAYER_IDS.merchant]: {
        ...merchant, resources: { ...merchant.resources, BRICK: 2 },
      } },
      bank: { ...base.bank, resources: { ...base.bank.resources, BRICK: 17 } },
    }
    expect(violation(poor, {
      type: 'MARITIME_TRADE', giveResource: 'BRICK', receiveResource: 'ORE',
    }, GOLDEN_PLAYER_IDS.merchant)).toBe('INSUFFICIENT_RESOURCES')

    const sentinel = base.players[GOLDEN_PLAYER_IDS.sentinel]
    if (sentinel === undefined) throw new Error('Missing Sentinel.')
    const emptyOre: GameState = {
      ...base,
      players: { ...base.players, [GOLDEN_PLAYER_IDS.sentinel]: {
        ...sentinel, resources: { ...sentinel.resources, ORE: 19 },
      } },
      bank: { ...base.bank, resources: { ...base.bank.resources, ORE: 0 } },
    }
    expect(violation(emptyOre, {
      type: 'MARITIME_TRADE', giveResource: 'BRICK', receiveResource: 'ORE',
    }, GOLDEN_PLAYER_IDS.merchant)).toBe('BANK_RESOURCE_UNAVAILABLE')

    let repeated: GameState = {
      ...base,
      players: { ...base.players, [GOLDEN_PLAYER_IDS.merchant]: {
        ...merchant, resources: { ...merchant.resources, BRICK: 6 },
      } },
      bank: { ...base.bank, resources: { ...base.bank.resources, BRICK: 13 } },
    }
    repeated = success(repeated, {
      type: 'MARITIME_TRADE', giveResource: 'BRICK', receiveResource: 'ORE',
    }, GOLDEN_PLAYER_IDS.merchant).state
    repeated = success(repeated, {
      type: 'MARITIME_TRADE', giveResource: 'BRICK', receiveResource: 'ORE',
    }, GOLDEN_PLAYER_IDS.merchant).state
    expect(repeated.players[GOLDEN_PLAYER_IDS.merchant]?.resources.ORE).toBe(2)
    expect(repeated.stateVersion).toBe(23)
  })

  it('executes authoritative 4:1 and matching-resource 2:1 ratios', () => {
    const noPortBase = createGoldenDomesticTradeStart()
    const sentinel = noPortBase.players[GOLDEN_PLAYER_IDS.sentinel]
    if (sentinel === undefined) throw new Error('Missing Sentinel.')
    const noPort: GameState = {
      ...noPortBase,
      players: { ...noPortBase.players, [GOLDEN_PLAYER_IDS.sentinel]: {
        ...sentinel, resources: { ...sentinel.resources, BRICK: 4 },
      } },
      bank: { ...noPortBase.bank, resources: { ...noPortBase.bank.resources, BRICK: 13 } },
    }
    const fourToOne = success(noPort, {
      type: 'MARITIME_TRADE', giveResource: 'BRICK', receiveResource: 'ORE',
    })
    expect(fourToOne.events[0]).toMatchObject({ ratio: 4 })

    const portBase = createGoldenMaritimeTradeStart()
    const merchant = portBase.players[GOLDEN_PLAYER_IDS.merchant]
    const controlledGeneric = Object.values(portBase.board.topology.ports).find(
      (port) => port.kind.type === 'GENERIC'
        && port.vertexIds.some((id) => portBase.board.vertexOccupancy[id]?.ownerId === GOLDEN_PLAYER_IDS.merchant),
    )
    const orePort = Object.values(portBase.board.topology.ports).find(
      (port) => port.kind.type === 'RESOURCE' && port.kind.resource === 'ORE',
    )
    if (merchant === undefined || controlledGeneric === undefined || orePort === undefined) {
      throw new Error('Missing 2:1 maritime fixture data.')
    }
    const ports = {
      ...portBase.board.topology.ports,
      [controlledGeneric.id]: { ...controlledGeneric, kind: { type: 'RESOURCE' as const, resource: 'ORE' as const } },
      [orePort.id]: { ...orePort, kind: { type: 'GENERIC' as const } },
    }
    const matching: GameState = {
      ...portBase,
      board: { ...portBase.board, topology: { ...portBase.board.topology, ports } },
      players: { ...portBase.players, [GOLDEN_PLAYER_IDS.merchant]: {
        ...merchant, resources: { ...EMPTY_TRADE_BAG, ORE: 2 },
      } },
      bank: { ...portBase.bank, resources: { LUMBER: 19, BRICK: 19, WOOL: 19, GRAIN: 19, ORE: 17 } },
    }
    const twoToOne = success(matching, {
      type: 'MARITIME_TRADE', giveResource: 'ORE', receiveResource: 'LUMBER',
    }, GOLDEN_PLAYER_IDS.merchant)
    expect(twoToOne.events[0]).toMatchObject({ ratio: 2 })
  })

  it('recognizes a port from current board occupancy later in the same ACTION phase', () => {
    const base = createGoldenDomesticTradeStart()
    const sentinel = base.players[GOLDEN_PLAYER_IDS.sentinel]
    const port = Object.values(base.board.topology.ports).find(
      (candidate) => candidate.kind.type === 'GENERIC'
        && candidate.vertexIds.some((id) => base.board.vertexOccupancy[id] === null),
    )
    if (sentinel === undefined || port === undefined) throw new Error('Missing acquired-port fixture.')
    const vertexId = port.vertexIds.find((id) => base.board.vertexOccupancy[id] === null)
    if (vertexId === undefined) throw new Error('Missing free port endpoint.')
    const state: GameState = {
      ...base,
      board: { ...base.board, vertexOccupancy: {
        ...base.board.vertexOccupancy,
        [vertexId]: { type: 'SETTLEMENT', ownerId: GOLDEN_PLAYER_IDS.sentinel },
      } },
      players: { ...base.players, [GOLDEN_PLAYER_IDS.sentinel]: {
        ...sentinel, resources: { ...sentinel.resources, BRICK: 3 },
      } },
      bank: { ...base.bank, resources: { ...base.bank.resources, BRICK: 14 } },
    }
    const result = success(state, {
      type: 'MARITIME_TRADE', giveResource: 'BRICK', receiveResource: 'ORE',
    })
    expect(result.events[0]).toMatchObject({ ratio: 3 })
  })
})
