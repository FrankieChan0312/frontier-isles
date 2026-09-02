import { expectTypeOf } from 'vitest'
import type { CommandEnvelope, GameCommand } from '../contracts/commands.ts'
import type { GameEvent } from '../contracts/events.ts'
import type { GameState } from '../model/game-state.ts'
import type {
  CommandId,
  DevelopmentCardId,
  EdgeId,
  PlayerId,
  TileId,
  VertexId,
} from '../model/ids.ts'
import { STANDARD_DEVELOPMENT_CARD_COST } from '../model/standard-development-card-cost.ts'
import type { ResourceBag } from '../model/resource.ts'
import { deriveLegalFreeRoadEdgeIds } from '../rules/development-card-rules.ts'
import { deriveLongestRoadLength } from '../rules/longest-road.ts'
import { deriveActualVictoryPoints, derivePublicVictoryPoints } from '../rules/scoring.ts'
import { executeRobberWorkflowCommand } from './robber-workflow-engine.ts'
import { reconcileAwards } from './scoring-reconciliation.ts'
import {
  executeDevelopmentCardLifecycleCommand,
  type DevelopmentCardLifecycleCommand,
  type DevelopmentCardLifecycleCommandEnvelope,
} from './development-card-lifecycle-engine.ts'
import { GOLDEN_PLAYER_IDS } from './task-05-golden-fixture.test-helper.ts'
import { createGoldenPaidBuildingStart } from './task-08-paid-building.test-helper.ts'
import {
  createTask08FinalState,
  moveStandardCardToPlayer,
} from './task-10-development-card.test-helper.ts'

function envelope(
  state: GameState,
  command: DevelopmentCardLifecycleCommand,
  actorId: PlayerId = GOLDEN_PLAYER_IDS.sentinel,
): DevelopmentCardLifecycleCommandEnvelope {
  return {
    commandId: `command:task-10:${state.stateVersion}:${command.type}` as CommandId,
    actorId,
    expectedStateVersion: state.stateVersion,
    command,
  }
}

function success(
  state: GameState,
  command: DevelopmentCardLifecycleCommand,
  actorId: PlayerId = GOLDEN_PLAYER_IDS.sentinel,
): { readonly state: GameState; readonly events: readonly GameEvent[] } {
  const result = executeDevelopmentCardLifecycleCommand(state, envelope(state, command, actorId))
  if (!result.ok) throw new Error(`Task 10 command failed: ${result.violation.code}.`)
  return result
}

function violation(
  state: GameState,
  command: DevelopmentCardLifecycleCommand,
  actorId: PlayerId = GOLDEN_PLAYER_IDS.sentinel,
): string | null {
  const result = executeDevelopmentCardLifecycleCommand(state, envelope(state, command, actorId))
  return result.ok ? null : result.violation.code
}

function eligibleCardState(type: 'KNIGHT' | 'ROAD_BUILDING' | 'INVENTION' | 'MONOPOLY'): GameState {
  const state = createGoldenPaidBuildingStart()
  return moveStandardCardToPlayer(
    { ...state, turn: { ...state.turn, turnNumber: 2 } },
    GOLDEN_PLAYER_IDS.sentinel,
    type,
    'IN_HAND',
    1,
  )
}

function ownedCardId(state: GameState, type: string): DevelopmentCardId {
  const card = state.players[GOLDEN_PLAYER_IDS.sentinel]?.developmentCards.find(
    (candidate) => candidate.type === type,
  )
  if (card === undefined) throw new Error(`Missing owned ${type} card.`)
  return card.id
}

describe('Task 10 public boundary and purchase', () => {
  it('exports the exact narrow command types and frozen cost', () => {
    expectTypeOf<DevelopmentCardLifecycleCommand>().toEqualTypeOf<Extract<
      GameCommand,
      | { readonly type: 'BUY_DEVELOPMENT_CARD' }
      | { readonly type: 'PLAY_DEVELOPMENT_CARD' }
      | { readonly type: 'CHOOSE_INVENTION_RESOURCES' }
      | { readonly type: 'CHOOSE_MONOPOLY_RESOURCE' }
      | { readonly type: 'BUILD_ROAD' }
      | { readonly type: 'FINISH_FREE_ROAD_PLACEMENT' }
    >>()
    expectTypeOf<DevelopmentCardLifecycleCommandEnvelope>().toEqualTypeOf<
      Omit<CommandEnvelope, 'command'> & { readonly command: DevelopmentCardLifecycleCommand }
    >()
    expect(STANDARD_DEVELOPMENT_CARD_COST).toEqual({
      LUMBER: 0, BRICK: 0, WOOL: 1, GRAIN: 1, ORE: 1,
    })
  })

  it('buys the exact top card at index zero with exact payment and no RNG draw', () => {
    const state = createGoldenPaidBuildingStart()
    const random = state.random
    expect(state.bank.developmentDeck[0]?.id).toBe('development-card:victory-point:03')
    const result = success(state, { type: 'BUY_DEVELOPMENT_CARD' })
    expect(result.state).toMatchObject({
      stateVersion: 18,
      turn: { phase: 'ACTION', currentPlayerId: GOLDEN_PLAYER_IDS.sentinel, turnNumber: 1 },
    })
    expect(result.state.random).toBe(random)
    expect(result.state.bank.developmentDeck).toHaveLength(24)
    expect(result.state.bank.developmentDeck[0]?.id).toBe('development-card:knight:09')
    expect(result.state.players[GOLDEN_PLAYER_IDS.sentinel]?.resources).toEqual({
      LUMBER: 3, BRICK: 3, WOOL: 0, GRAIN: 2, ORE: 2,
    })
    expect(result.state.bank.resources).toEqual({
      LUMBER: 16, BRICK: 11, WOOL: 18, GRAIN: 15, ORE: 17,
    })
    expect(result.state.players[GOLDEN_PLAYER_IDS.sentinel]?.developmentCards).toEqual([{
      id: 'development-card:victory-point:03',
      type: 'VICTORY_POINT',
      acquiredTurnNumber: 1,
      status: 'IN_HAND',
    }])
    expect(result.events).toEqual([{
      type: 'DEVELOPMENT_CARD_BOUGHT',
      ownerId: GOLDEN_PLAYER_IDS.sentinel,
      cardId: 'development-card:victory-point:03',
      cardType: 'VICTORY_POINT',
      acquiredTurnNumber: 1,
    }])
  })

  it('allows repeated purchases while resources and deck remain', () => {
    const base = createGoldenPaidBuildingStart()
    const sentinel = base.players[GOLDEN_PLAYER_IDS.sentinel]
    if (sentinel === undefined) throw new Error('Missing Sentinel.')
    let state: GameState = {
      ...base,
      players: { ...base.players, [GOLDEN_PLAYER_IDS.sentinel]: {
        ...sentinel,
        resources: { ...sentinel.resources, WOOL: 2 },
      } },
      bank: { ...base.bank, resources: { ...base.bank.resources, WOOL: 16 } },
    }
    state = success(state, { type: 'BUY_DEVELOPMENT_CARD' }).state
    state = success(state, { type: 'BUY_DEVELOPMENT_CARD' }).state
    expect(state.stateVersion).toBe(19)
    expect(state.players[GOLDEN_PLAYER_IDS.sentinel]?.developmentCards).toHaveLength(2)
    expect(state.bank.developmentDeck).toHaveLength(23)
  })

  it('uses deck-empty before affordability and preserves failures', () => {
    const base = createGoldenPaidBuildingStart()
    const sentinel = base.players[GOLDEN_PLAYER_IDS.sentinel]
    if (sentinel === undefined) throw new Error('Missing Sentinel.')
    const owned = base.bank.developmentDeck.map((card) => ({
      ...card, acquiredTurnNumber: 0, status: 'IN_HAND' as const,
    }))
    const emptyDeck: GameState = {
      ...base,
      bank: {
        ...base.bank,
        resources: { ...base.bank.resources, WOOL: 18, GRAIN: 17, ORE: 19 },
        developmentDeck: [],
      },
      players: { ...base.players, [GOLDEN_PLAYER_IDS.sentinel]: {
        ...sentinel,
        resources: { LUMBER: 3, BRICK: 3, WOOL: 0, GRAIN: 0, ORE: 0 },
        developmentCards: owned,
      } },
    }
    const snapshot = structuredClone(emptyDeck)
    expect(violation(emptyDeck, { type: 'BUY_DEVELOPMENT_CARD' })).toBe('DEVELOPMENT_DECK_EMPTY')
    expect(emptyDeck).toEqual(snapshot)

    const poor: GameState = {
      ...base,
      players: { ...base.players, [GOLDEN_PLAYER_IDS.sentinel]: {
        ...sentinel, resources: { ...sentinel.resources, WOOL: 0 },
      } },
      bank: { ...base.bank, resources: { ...base.bank.resources, WOOL: 18 } },
    }
    expect(violation(poor, { type: 'BUY_DEVELOPMENT_CARD' })).toBe('INSUFFICIENT_RESOURCES')

    const beforeRoll: GameState = {
      ...base,
      turn: { ...base.turn, phase: 'ROLL_REQUIRED', lastRoll: null },
    }
    expect(violation(beforeRoll, { type: 'BUY_DEVELOPMENT_CARD' })).toBe('WRONG_PHASE')
  })

  it('wins immediately when buying the fifth hidden VP point from a pre-purchase score of nine', () => {
    const base = createGoldenPaidBuildingStart()
    const sentinel = base.players[GOLDEN_PLAYER_IDS.sentinel]
    const top = base.bank.developmentDeck[0]
    if (sentinel === undefined || top?.type !== 'VICTORY_POINT') throw new Error('Missing VP purchase fixture.')
    const otherVpCards = base.bank.developmentDeck.filter(
      (card) => card.type === 'VICTORY_POINT' && card.id !== top.id,
    )
    const otherIds = new Set(otherVpCards.map((card) => card.id))
    const fixture: GameState = {
      ...base,
      board: { ...base.board, vertexOccupancy: {
        ...base.board.vertexOccupancy,
        ['vertex:-1,-1,2' as VertexId]: { type: 'CITY', ownerId: GOLDEN_PLAYER_IDS.sentinel },
        ['vertex:-4,-4,8' as VertexId]: { type: 'CITY', ownerId: GOLDEN_PLAYER_IDS.sentinel },
        ['vertex:5,-4,-1' as VertexId]: { type: 'SETTLEMENT', ownerId: GOLDEN_PLAYER_IDS.sentinel },
      } },
      bank: { ...base.bank, developmentDeck: base.bank.developmentDeck.filter(
        (card) => !otherIds.has(card.id),
      ) },
      players: { ...base.players, [GOLDEN_PLAYER_IDS.sentinel]: {
        ...sentinel,
        developmentCards: otherVpCards.map((card) => ({
          ...card, acquiredTurnNumber: 0, status: 'IN_HAND' as const,
        })),
      } },
    }
    expect(deriveActualVictoryPoints(fixture, GOLDEN_PLAYER_IDS.sentinel)).toBe(9)
    const flag = fixture.turn.developmentCardPlayedThisTurn
    const result = success(fixture, { type: 'BUY_DEVELOPMENT_CARD' })
    expect(result.state).toMatchObject({
      winnerId: GOLDEN_PLAYER_IDS.sentinel,
      turn: { phase: 'GAME_OVER', developmentCardPlayedThisTurn: flag },
    })
    expect(derivePublicVictoryPoints(result.state, GOLDEN_PLAYER_IDS.sentinel)).toBe(10)
    expect(result.state.players[GOLDEN_PLAYER_IDS.sentinel]?.developmentCards.every(
      (card) => card.status === 'REVEALED',
    )).toBe(true)
    expect(result.events.map((event) => event.type)).toEqual([
      'DEVELOPMENT_CARD_BOUGHT', 'GAME_WON',
    ])
  })
})

describe('general development-card playability', () => {
  it('plays an eligible card before rolling and during ACTION', () => {
    for (const beforeRoll of [true, false]) {
      let state = eligibleCardState('MONOPOLY')
      if (beforeRoll) state = { ...state, turn: { ...state.turn, phase: 'ROLL_REQUIRED', lastRoll: null } }
      const cardId = ownedCardId(state, 'MONOPOLY')
      const result = success(state, { type: 'PLAY_DEVELOPMENT_CARD', cardId })
      expect(result.state.turn.developmentCardPlayedThisTurn).toBe(true)
      expect(result.state.turn.phase).toBe(beforeRoll ? 'ROLL_REQUIRED' : 'ACTION')
      expect(result.state.pendingDecision?.type).toBe('CHOOSE_MONOPOLY_RESOURCE')
      expect(result.events).toEqual([{
        type: 'DEVELOPMENT_CARD_PLAYED', ownerId: GOLDEN_PLAYER_IDS.sentinel,
        cardId, cardType: 'MONOPOLY',
      }])
    }
  })

  it('enforces ownership, status, same-turn, VP, one-per-turn, and phase rules', () => {
    const state = eligibleCardState('INVENTION')
    const cardId = ownedCardId(state, 'INVENTION')
    expect(violation(state, {
      type: 'PLAY_DEVELOPMENT_CARD', cardId: 'development-card:invention:missing' as DevelopmentCardId,
    })).toBe('DEVELOPMENT_CARD_NOT_OWNED')

    const sameTurn = moveStandardCardToPlayer(
      createGoldenPaidBuildingStart(), GOLDEN_PLAYER_IDS.sentinel, 'MONOPOLY', 'IN_HAND', 1,
    )
    expect(violation(sameTurn, {
      type: 'PLAY_DEVELOPMENT_CARD', cardId: ownedCardId(sameTurn, 'MONOPOLY'),
    })).toBe('DEVELOPMENT_CARD_NOT_PLAYABLE')

    const played = moveStandardCardToPlayer(
      { ...createGoldenPaidBuildingStart(), turn: { ...createGoldenPaidBuildingStart().turn, turnNumber: 2 } },
      GOLDEN_PLAYER_IDS.sentinel, 'MONOPOLY', 'PLAYED', 1,
    )
    expect(violation(played, {
      type: 'PLAY_DEVELOPMENT_CARD', cardId: ownedCardId(played, 'MONOPOLY'),
    })).toBe('DEVELOPMENT_CARD_NOT_PLAYABLE')

    const vp = moveStandardCardToPlayer(
      { ...createGoldenPaidBuildingStart(), turn: { ...createGoldenPaidBuildingStart().turn, turnNumber: 2 } },
      GOLDEN_PLAYER_IDS.sentinel, 'VICTORY_POINT', 'IN_HAND', 1,
    )
    expect(violation(vp, {
      type: 'PLAY_DEVELOPMENT_CARD', cardId: ownedCardId(vp, 'VICTORY_POINT'),
    })).toBe('DEVELOPMENT_CARD_NOT_PLAYABLE')

    const limited: GameState = { ...state, turn: { ...state.turn, developmentCardPlayedThisTurn: true } }
    expect(violation(limited, { type: 'PLAY_DEVELOPMENT_CARD', cardId })).toBe('DEVELOPMENT_CARD_LIMIT_REACHED')
    const wrongPhase: GameState = { ...state, turn: {
      ...state.turn,
      phase: 'ROBBER_MOVE_REQUIRED',
      lastRoll: { dice: [3, 4], total: 7 },
    }, pendingDecision: {
      type: 'MOVE_ROBBER', actingPlayerId: GOLDEN_PLAYER_IDS.sentinel, cause: { type: 'DICE_SEVEN' },
    } }
    expect(violation(wrongPhase, { type: 'PLAY_DEVELOPMENT_CARD', cardId })).toBe('PENDING_DECISION_REQUIRED')
  })

  it('applies shared validation precedence without mutating failures', () => {
    const state = eligibleCardState('MONOPOLY')
    const command = envelope(state, {
      type: 'PLAY_DEVELOPMENT_CARD', cardId: 'development-card:missing' as DevelopmentCardId,
    }, 'player:unknown' as PlayerId)
    const snapshot = structuredClone(state)
    const stale = executeDevelopmentCardLifecycleCommand(state, { ...command, expectedStateVersion: 999 })
    expect(stale.ok ? null : stale.violation.code).toBe('STALE_STATE_VERSION')
    const unknown = executeDevelopmentCardLifecycleCommand(state, command)
    expect(unknown.ok ? null : unknown.violation.code).toBe('UNKNOWN_ACTOR')
    expect(state).toEqual(snapshot)
  })
})

describe('Road Building lifecycle', () => {
  it('replays the exact two-road golden lifecycle for free and awards Longest Road', () => {
    let state = createTask08FinalState()
    state = moveStandardCardToPlayer(
      { ...state, turn: { ...state.turn, turnNumber: 2 } },
      GOLDEN_PLAYER_IDS.sentinel,
      'ROAD_BUILDING',
      'IN_HAND',
      1,
      'development-card:road-building:01' as DevelopmentCardId,
    )
    const resources = state.players[GOLDEN_PLAYER_IDS.sentinel]?.resources
    const bankResources = state.bank.resources
    const random = state.random
    const cardId = ownedCardId(state, 'ROAD_BUILDING')
    const events: GameEvent[] = []
    let result = success(state, { type: 'PLAY_DEVELOPMENT_CARD', cardId })
    state = result.state
    events.push(...result.events)
    expect(state.stateVersion).toBe(22)
    expect(state.pendingDecision).toMatchObject({ type: 'PLACE_FREE_ROADS', remainingRoadCount: 2 })

    result = success(state, {
      type: 'BUILD_ROAD', edgeId: 'edge:vertex:2,-1,-1|vertex:4,-2,-2' as EdgeId,
    })
    state = result.state
    events.push(...result.events)
    expect(state.stateVersion).toBe(23)
    expect(state.pendingDecision).toMatchObject({ remainingRoadCount: 1 })

    result = success(state, {
      type: 'BUILD_ROAD', edgeId: 'edge:vertex:4,-2,-2|vertex:5,-4,-1' as EdgeId,
    })
    state = result.state
    events.push(...result.events)
    expect(state).toMatchObject({
      stateVersion: 24,
      turn: { phase: 'ACTION', developmentCardPlayedThisTurn: true },
      pendingDecision: null,
      awards: { longestRoadHolderId: GOLDEN_PLAYER_IDS.sentinel },
      random: { state: 1264537981, drawCount: 86 },
    })
    expect(state.players[GOLDEN_PLAYER_IDS.sentinel]?.resources).toEqual(resources)
    expect(state.bank.resources).toBe(bankResources)
    expect(state.random).toBe(random)
    expect(deriveLongestRoadLength(state.board, GOLDEN_PLAYER_IDS.sentinel)).toBe(5)
    expect(derivePublicVictoryPoints(state, GOLDEN_PLAYER_IDS.sentinel)).toBe(6)
    expect(events.map((event) => event.type)).toEqual([
      'DEVELOPMENT_CARD_PLAYED', 'ROAD_BUILT', 'ROAD_BUILT', 'LONGEST_ROAD_CHANGED',
    ])
    expect(events.filter((event) => event.type === 'ROAD_BUILT').every(
      (event) => event.source === 'ROAD_BUILDING_CARD',
    )).toBe(true)
  })

  it('rejects play without any legal connected edge', () => {
    let state = eligibleCardState('ROAD_BUILDING')
    state = { ...state, board: {
      ...state.board,
      vertexOccupancy: Object.fromEntries(Object.keys(state.board.vertexOccupancy).map((id) => [id, null])) as GameState['board']['vertexOccupancy'],
      edgeOccupancy: Object.fromEntries(Object.keys(state.board.edgeOccupancy).map((id) => [id, null])) as GameState['board']['edgeOccupancy'],
    } }
    expect(violation(state, {
      type: 'PLAY_DEVELOPMENT_CARD', cardId: ownedCardId(state, 'ROAD_BUILDING'),
    })).toBe('DEVELOPMENT_CARD_NOT_PLAYABLE')
  })

  it('sets the pending count to one when only one road piece remains', () => {
    let state = eligibleCardState('ROAD_BUILDING')
    const protectedEdgeId = deriveLegalFreeRoadEdgeIds(state, GOLDEN_PLAYER_IDS.sentinel)[0]
    if (protectedEdgeId === undefined) throw new Error('Missing protected legal edge.')
    const edgeOccupancy = { ...state.board.edgeOccupancy } as Record<
      EdgeId,
      { readonly ownerId: PlayerId } | null
    >
    let ownedRoadCount = Object.values(edgeOccupancy).filter(
      (road) => road?.ownerId === GOLDEN_PLAYER_IDS.sentinel,
    ).length
    for (const edgeId of Object.keys(edgeOccupancy) as EdgeId[]) {
      if (ownedRoadCount >= 14) break
      if (edgeId !== protectedEdgeId && edgeOccupancy[edgeId] === null) {
        edgeOccupancy[edgeId] = { ownerId: GOLDEN_PLAYER_IDS.sentinel }
        ownedRoadCount += 1
      }
    }
    expect(ownedRoadCount).toBe(14)
    state = reconcileAwards({ ...state, board: { ...state.board, edgeOccupancy } }).state
    const result = success(state, {
      type: 'PLAY_DEVELOPMENT_CARD', cardId: ownedCardId(state, 'ROAD_BUILDING'),
    })
    expect(result.state.pendingDecision).toMatchObject({
      type: 'PLACE_FREE_ROADS',
      remainingRoadCount: 1,
    })
  })

  it('permits dead-end completion only after the first placement leaves no legal second edge', () => {
    let state = eligibleCardState('ROAD_BUILDING')
    const topology = state.board.topology
    const coastalVertex = Object.values(topology.vertices).find((vertex) => vertex.edgeIds.length === 2)
    if (coastalVertex === undefined) throw new Error('Missing coastal vertex.')
    const targetEdgeId = coastalVertex.edgeIds[0]
    const blockedAtStart = coastalVertex.edgeIds[1]
    if (targetEdgeId === undefined || blockedAtStart === undefined) throw new Error('Incomplete coastal fixture.')
    const targetEdge = topology.edges[targetEdgeId]
    if (targetEdge === undefined) throw new Error('Missing target edge.')
    const otherVertexId = targetEdge.vertexIds.find((id) => id !== coastalVertex.id)
    if (otherVertexId === undefined) throw new Error('Missing opposite endpoint.')
    const otherVertex = topology.vertices[otherVertexId]
    if (otherVertex === undefined) throw new Error('Missing opposite vertex.')
    const blockers = [blockedAtStart, ...otherVertex.edgeIds.filter((id) => id !== targetEdgeId)]
    state = { ...state, board: {
      ...state.board,
      vertexOccupancy: {
        ...Object.fromEntries(Object.keys(state.board.vertexOccupancy).map((id) => [id, null])),
        [coastalVertex.id]: { type: 'SETTLEMENT', ownerId: GOLDEN_PLAYER_IDS.sentinel },
      } as GameState['board']['vertexOccupancy'],
      edgeOccupancy: {
        ...Object.fromEntries(Object.keys(state.board.edgeOccupancy).map((id) => [id, null])),
        ...Object.fromEntries(blockers.map((id) => [id, { ownerId: GOLDEN_PLAYER_IDS.human }])),
      } as GameState['board']['edgeOccupancy'],
    } }
    const cardId = ownedCardId(state, 'ROAD_BUILDING')
    state = success(state, { type: 'PLAY_DEVELOPMENT_CARD', cardId }).state
    expect(violation(state, { type: 'FINISH_FREE_ROAD_PLACEMENT' })).toBe('DEVELOPMENT_CARD_NOT_PLAYABLE')
    state = success(state, { type: 'BUILD_ROAD', edgeId: targetEdgeId }).state
    expect(state.pendingDecision).toMatchObject({ remainingRoadCount: 1 })
    const result = success(state, { type: 'FINISH_FREE_ROAD_PLACEMENT' })
    expect(result.state.stateVersion).toBe(state.stateVersion + 1)
    expect(result.state.pendingDecision).toBeNull()
    expect(result.state.turn.phase).toBe('ACTION')
    expect(result.events).toEqual([])
  })

  it('rejects finish while a legal second road remains and preserves normal road violations', () => {
    let state = eligibleCardState('ROAD_BUILDING')
    const cardId = ownedCardId(state, 'ROAD_BUILDING')
    state = success(state, { type: 'PLAY_DEVELOPMENT_CARD', cardId }).state
    state = success(state, {
      type: 'BUILD_ROAD', edgeId: 'edge:vertex:-1,-1,2|vertex:1,-2,1' as EdgeId,
    }).state
    expect(violation(state, { type: 'FINISH_FREE_ROAD_PLACEMENT' })).toBe('DEVELOPMENT_CARD_NOT_PLAYABLE')
    expect(violation(state, {
      type: 'BUILD_ROAD', edgeId: 'edge:unknown' as EdgeId,
    })).toBe('ILLEGAL_EDGE')
  })

  it('cancels the second free road when the first road wins via Longest Road', () => {
    let state = eligibleCardState('ROAD_BUILDING')
    const chain = [
      'edge:vertex:-1,-1,2|vertex:-2,1,1',
      'edge:vertex:-1,2,-1|vertex:-2,1,1',
      'edge:vertex:-1,2,-1|vertex:1,1,-2',
      'edge:vertex:1,1,-2|vertex:2,-1,-1',
    ].map((id) => id as EdgeId)
    const cityVertices = [
      'vertex:-4,-4,8', 'vertex:-1,-7,8', 'vertex:-1,8,-7', 'vertex:5,-4,-1',
    ].map((id) => id as VertexId)
    state = { ...state, board: {
      ...state.board,
      vertexOccupancy: {
        ...Object.fromEntries(Object.keys(state.board.vertexOccupancy).map((id) => [id, null])),
        ...Object.fromEntries(cityVertices.map((id) => [id, { type: 'CITY', ownerId: GOLDEN_PLAYER_IDS.sentinel }])),
      } as GameState['board']['vertexOccupancy'],
      edgeOccupancy: {
        ...Object.fromEntries(Object.keys(state.board.edgeOccupancy).map((id) => [id, null])),
        ...Object.fromEntries(chain.map((id) => [id, { ownerId: GOLDEN_PLAYER_IDS.sentinel }])),
      } as GameState['board']['edgeOccupancy'],
    } }
    state = success(state, {
      type: 'PLAY_DEVELOPMENT_CARD', cardId: ownedCardId(state, 'ROAD_BUILDING'),
    }).state
    const result = success(state, {
      type: 'BUILD_ROAD', edgeId: 'edge:vertex:1,-2,1|vertex:2,-1,-1' as EdgeId,
    })
    expect(result.state).toMatchObject({
      winnerId: GOLDEN_PLAYER_IDS.sentinel,
      pendingDecision: null,
      turn: { phase: 'GAME_OVER' },
    })
    expect(result.events.map((event) => event.type)).toEqual([
      'ROAD_BUILT', 'LONGEST_ROAD_CHANGED', 'GAME_WON',
    ])
  })
})

describe('Invention and Monopoly', () => {
  it('plays and resolves same-resource Invention with two versions and one total event', () => {
    let state = eligibleCardState('INVENTION')
    const random = state.random
    const startOre = state.players[GOLDEN_PLAYER_IDS.sentinel]?.resources.ORE ?? 0
    const bankOre = state.bank.resources.ORE
    const play = success(state, {
      type: 'PLAY_DEVELOPMENT_CARD', cardId: ownedCardId(state, 'INVENTION'),
    })
    state = play.state
    expect(state.pendingDecision?.type).toBe('CHOOSE_INVENTION_RESOURCES')
    const choice = success(state, {
      type: 'CHOOSE_INVENTION_RESOURCES',
      resources: { LUMBER: 0, BRICK: 0, WOOL: 0, GRAIN: 0, ORE: 2 },
    })
    expect(choice.state.stateVersion).toBe(state.stateVersion + 1)
    expect(choice.state.pendingDecision).toBeNull()
    expect(choice.state.players[GOLDEN_PLAYER_IDS.sentinel]?.resources.ORE).toBe(startOre + 2)
    expect(choice.state.bank.resources.ORE).toBe(bankOre - 2)
    expect(choice.state.random).toBe(random)
    expect([...play.events, ...choice.events].map((event) => event.type)).toEqual([
      'DEVELOPMENT_CARD_PLAYED',
    ])

    let different = eligibleCardState('INVENTION')
    different = success(different, {
      type: 'PLAY_DEVELOPMENT_CARD', cardId: ownedCardId(different, 'INVENTION'),
    }).state
    const differentChoice = success(different, {
      type: 'CHOOSE_INVENTION_RESOURCES',
      resources: { LUMBER: 1, BRICK: 1, WOOL: 0, GRAIN: 0, ORE: 0 },
    })
    expect(differentChoice.state.players[GOLDEN_PLAYER_IDS.sentinel]?.resources).toMatchObject({
      LUMBER: 4,
      BRICK: 4,
    })
  })

  it('validates Invention shape, total, integer counts, and bank supply', () => {
    let state = eligibleCardState('INVENTION')
    state = success(state, {
      type: 'PLAY_DEVELOPMENT_CARD', cardId: ownedCardId(state, 'INVENTION'),
    }).state
    const human = state.players[GOLDEN_PLAYER_IDS.human]
    if (human === undefined) throw new Error('Missing Human.')
    for (const resources of [
      { LUMBER: 0, BRICK: 0, WOOL: 0, GRAIN: 0, ORE: 1 },
      { LUMBER: 0, BRICK: 0, WOOL: 0, GRAIN: -1, ORE: 3 },
      { LUMBER: 0, BRICK: 0, WOOL: 0, GRAIN: 0.5, ORE: 1.5 },
    ]) {
      expect(violation(state, {
        type: 'CHOOSE_INVENTION_RESOURCES', resources,
      })).toBe('DEVELOPMENT_CARD_NOT_PLAYABLE')
    }
    for (const resources of [
      { LUMBER: 0, BRICK: 0, WOOL: 0, GRAIN: 2 },
      { LUMBER: 0, BRICK: 0, WOOL: 0, GRAIN: 0, ORE: 2, EXTRA: 0 },
    ]) {
      expect(violation(state, {
        type: 'CHOOSE_INVENTION_RESOURCES',
        resources: resources as unknown as ResourceBag,
      })).toBe('DEVELOPMENT_CARD_NOT_PLAYABLE')
    }
    const shortage: GameState = {
      ...state,
      bank: { ...state.bank, resources: { ...state.bank.resources, ORE: 1 } },
      players: { ...state.players, [GOLDEN_PLAYER_IDS.human]: {
        ...human,
        resources: { ...human.resources, ORE: 15 },
      } },
    }
    expect(violation(shortage, {
      type: 'CHOOSE_INVENTION_RESOURCES',
      resources: { LUMBER: 0, BRICK: 0, WOOL: 0, GRAIN: 0, ORE: 2 },
    })).toBe('BANK_RESOURCE_UNAVAILABLE')
  })

  it('rejects Invention play when fewer than two bank cards remain in total', () => {
    let state = eligibleCardState('INVENTION')
    const players = { ...state.players }
    for (const playerId of state.playerOrder) {
      const player = players[playerId]
      if (player === undefined) throw new Error('Missing player.')
      players[playerId] = { ...player, resources: { LUMBER: 0, BRICK: 0, WOOL: 0, GRAIN: 0, ORE: 0 } }
    }
    const sentinel = players[GOLDEN_PLAYER_IDS.sentinel]
    if (sentinel === undefined) throw new Error('Missing Sentinel.')
    players[GOLDEN_PLAYER_IDS.sentinel] = { ...sentinel, resources: {
      LUMBER: 18, BRICK: 19, WOOL: 19, GRAIN: 19, ORE: 19,
    } }
    state = { ...state, players, bank: { ...state.bank, resources: {
      LUMBER: 1, BRICK: 0, WOOL: 0, GRAIN: 0, ORE: 0,
    } } }
    expect(violation(state, {
      type: 'PLAY_DEVELOPMENT_CARD', cardId: ownedCardId(state, 'INVENTION'),
    })).toBe('DEVELOPMENT_CARD_NOT_PLAYABLE')
  })

  it('transfers Monopoly in player order, leaves bank unchanged, and allows zero', () => {
    let state = eligibleCardState('MONOPOLY')
    const counts = [0, 2, 3, 1] as const
    const players = { ...state.players }
    state.playerOrder.forEach((playerId, index) => {
      const player = players[playerId]
      if (player === undefined) throw new Error('Missing Monopoly player.')
      players[playerId] = { ...player, resources: { ...player.resources, LUMBER: counts[index] ?? 0 } }
    })
    state = { ...state, players, bank: { ...state.bank, resources: { ...state.bank.resources, LUMBER: 13 } } }
    const bank = state.bank
    state = success(state, {
      type: 'PLAY_DEVELOPMENT_CARD', cardId: ownedCardId(state, 'MONOPOLY'),
    }).state
    const choice = success(state, { type: 'CHOOSE_MONOPOLY_RESOURCE', resource: 'LUMBER' })
    expect(choice.state.players[GOLDEN_PLAYER_IDS.sentinel]?.resources.LUMBER).toBe(6)
    expect(state.playerOrder.slice(1).every(
      (playerId) => choice.state.players[playerId]?.resources.LUMBER === 0,
    )).toBe(true)
    expect(choice.state.bank).toBe(bank)
    expect(choice.events).toEqual([])

    let zero = eligibleCardState('MONOPOLY')
    zero = success(zero, {
      type: 'PLAY_DEVELOPMENT_CARD', cardId: ownedCardId(zero, 'MONOPOLY'),
    }).state
    expect(success(zero, { type: 'CHOOSE_MONOPOLY_RESOURCE', resource: 'ORE' }).events).toEqual([])
  })

  it('rejects malformed runtime Monopoly resources', () => {
    let state = eligibleCardState('MONOPOLY')
    state = success(state, {
      type: 'PLAY_DEVELOPMENT_CARD', cardId: ownedCardId(state, 'MONOPOLY'),
    }).state
    expect(violation(state, {
      type: 'CHOOSE_MONOPOLY_RESOURCE', resource: 'INVALID' as 'ORE',
    })).toBe('DEVELOPMENT_CARD_NOT_PLAYABLE')
  })
})

describe('Knight and robber/scoring integration', () => {
  function knightVictoryFixture(beforeRoll: boolean, withTarget: boolean): GameState {
    let state = createGoldenPaidBuildingStart()
    state = { ...state, turn: {
      ...state.turn,
      turnNumber: 2,
      phase: beforeRoll ? 'ROLL_REQUIRED' : 'ACTION',
      lastRoll: beforeRoll ? null : state.turn.lastRoll,
    } }
    state = moveStandardCardToPlayer(state, GOLDEN_PLAYER_IDS.sentinel, 'KNIGHT', 'PLAYED', 1)
    state = moveStandardCardToPlayer(state, GOLDEN_PLAYER_IDS.sentinel, 'KNIGHT', 'PLAYED', 1)
    state = moveStandardCardToPlayer(state, GOLDEN_PLAYER_IDS.sentinel, 'KNIGHT', 'IN_HAND', 1)
    const cityVertices = [
      'vertex:-4,-4,8', 'vertex:-1,-7,8', 'vertex:-1,8,-7', 'vertex:5,-4,-1',
    ].map((id) => id as VertexId)
    return { ...state, board: {
      ...state.board,
      vertexOccupancy: {
        ...Object.fromEntries(Object.keys(state.board.vertexOccupancy).map((id) => [id, null])),
        ...Object.fromEntries(cityVertices.map((id) => [id, { type: 'CITY', ownerId: GOLDEN_PLAYER_IDS.sentinel }])),
        ...(withTarget ? {
          ['vertex:-4,-1,5' as VertexId]: { type: 'SETTLEMENT', ownerId: GOLDEN_PLAYER_IDS.human },
        } : {}),
      } as GameState['board']['vertexOccupancy'],
    } }
  }

  it('plays the third Knight, awards Largest Army, and completes no-target victory after movement', () => {
    for (const beforeRoll of [true, false]) {
      let state = knightVictoryFixture(beforeRoll, false)
      const cardId = state.players[GOLDEN_PLAYER_IDS.sentinel]?.developmentCards.find(
        (card) => card.type === 'KNIGHT' && card.status === 'IN_HAND',
      )?.id
      if (cardId === undefined) throw new Error('Missing playable Knight.')
      const play = success(state, { type: 'PLAY_DEVELOPMENT_CARD', cardId })
      state = play.state
      expect(state.players[GOLDEN_PLAYER_IDS.sentinel]?.playedKnights).toBe(3)
      expect(state.awards.largestArmyHolderId).toBe(GOLDEN_PLAYER_IDS.sentinel)
      expect(state.winnerId).toBeNull()
      expect(state.pendingDecision).toEqual({
        type: 'MOVE_ROBBER', actingPlayerId: GOLDEN_PLAYER_IDS.sentinel,
        cause: { type: 'KNIGHT', cardId },
      })
      expect(play.events.map((event) => event.type)).toEqual([
        'DEVELOPMENT_CARD_PLAYED', 'LARGEST_ARMY_CHANGED',
      ])
      const random = state.random
      const move = executeRobberWorkflowCommand(state, {
        commandId: 'command:task-10:knight-move' as CommandId,
        actorId: GOLDEN_PLAYER_IDS.sentinel,
        expectedStateVersion: state.stateVersion,
        command: { type: 'MOVE_ROBBER', tileId: 'tile:1,-2' as TileId },
      })
      if (!move.ok) throw new Error(`Knight movement failed: ${move.violation.code}.`)
      expect(move.state.random).toBe(random)
      expect(move.state).toMatchObject({
        winnerId: GOLDEN_PLAYER_IDS.sentinel,
        pendingDecision: null,
        turn: { phase: 'GAME_OVER' },
      })
      expect(move.events.map((event) => event.type)).toEqual(['ROBBER_MOVED', 'GAME_WON'])
    }
  })

  it('defers targeted Knight victory until after the accepted theft draw', () => {
    let state = knightVictoryFixture(false, true)
    const cardId = state.players[GOLDEN_PLAYER_IDS.sentinel]?.developmentCards.find(
      (card) => card.type === 'KNIGHT' && card.status === 'IN_HAND',
    )?.id
    if (cardId === undefined) throw new Error('Missing playable Knight.')
    state = success(state, { type: 'PLAY_DEVELOPMENT_CARD', cardId }).state
    const moved = executeRobberWorkflowCommand(state, {
      commandId: 'command:task-10:knight-target-move' as CommandId,
      actorId: GOLDEN_PLAYER_IDS.sentinel,
      expectedStateVersion: state.stateVersion,
      command: { type: 'MOVE_ROBBER', tileId: 'tile:-2,2' as TileId },
    })
    if (!moved.ok) throw new Error(`Knight target movement failed: ${moved.violation.code}.`)
    expect(moved.state.winnerId).toBeNull()
    expect(moved.state.turn.phase).toBe('ROBBER_TARGET_REQUIRED')
    const drawCount = moved.state.random.drawCount
    const stolen = executeRobberWorkflowCommand(moved.state, {
      commandId: 'command:task-10:knight-steal' as CommandId,
      actorId: GOLDEN_PLAYER_IDS.sentinel,
      expectedStateVersion: moved.state.stateVersion,
      command: { type: 'STEAL_FROM_PLAYER', targetPlayerId: GOLDEN_PLAYER_IDS.human },
    })
    if (!stolen.ok) throw new Error(`Knight theft failed: ${stolen.violation.code}.`)
    expect(stolen.state.random.drawCount).toBe(drawCount + 1)
    expect(stolen.state.winnerId).toBe(GOLDEN_PLAYER_IDS.sentinel)
    expect(stolen.events.map((event) => event.type)).toEqual(['RESOURCE_STOLEN', 'GAME_WON'])
  })
})
