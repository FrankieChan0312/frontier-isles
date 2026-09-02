import type { GameState } from '../model/game-state.ts'
import type { DevelopmentCardId, EdgeId, PlayerId, VertexId } from '../model/ids.ts'
import { STANDARD_DEVELOPMENT_DECK_SOURCE } from '../model/standard-development-deck.ts'
import {
  CITY_VICTORY_POINTS,
  LARGEST_ARMY_MINIMUM_KNIGHTS,
  LARGEST_ARMY_VICTORY_POINTS,
  LONGEST_ROAD_MINIMUM_LENGTH,
  LONGEST_ROAD_VICTORY_POINTS,
  SETTLEMENT_VICTORY_POINTS,
  STANDARD_VICTORY_POINT_TARGET,
  VICTORY_POINT_CARD_POINTS,
} from '../model/standard-scoring.ts'
import {
  deriveActualVictoryPoints,
  derivePlayerScore,
  derivePublicVictoryPoints,
  type PlayerScoreBreakdown,
} from '../rules/scoring.ts'
import { reconcileAwards, reconcileAwardsAndCurrentPlayerVictory } from './scoring-reconciliation.ts'
import type { ScoringReconciliationResult } from './scoring-reconciliation.ts'
import { assertScoringState } from './scoring-invariants.ts'
import { GOLDEN_PLAYER_IDS } from './task-05-golden-fixture.test-helper.ts'
import { createGoldenPaidBuildingStart } from './task-08-paid-building.test-helper.ts'

const SENTINEL_CHAIN: readonly EdgeId[] = [
  'edge:vertex:-1,-1,2|vertex:-2,1,1',
  'edge:vertex:-1,2,-1|vertex:-2,1,1',
  'edge:vertex:-1,2,-1|vertex:1,1,-2',
  'edge:vertex:1,1,-2|vertex:2,-1,-1',
  'edge:vertex:1,-2,1|vertex:2,-1,-1',
].map((edgeId) => edgeId as EdgeId)
const BUILDER_CHAIN: readonly EdgeId[] = [
  'edge:vertex:-1,-4,5|vertex:1,-5,4',
  'edge:vertex:1,-5,4|vertex:2,-4,2',
  'edge:vertex:2,-4,2|vertex:4,-5,1',
  'edge:vertex:4,-5,1|vertex:5,-4,-1',
  'edge:vertex:4,-2,-2|vertex:5,-4,-1',
].map((edgeId) => edgeId as EdgeId)

function emptyScoringState(): GameState {
  const source = createGoldenPaidBuildingStart()
  return {
    ...source,
    board: {
      ...source.board,
      vertexOccupancy: Object.fromEntries(
        Object.keys(source.board.vertexOccupancy).map((id) => [id, null]),
      ) as GameState['board']['vertexOccupancy'],
      edgeOccupancy: Object.fromEntries(
        Object.keys(source.board.edgeOccupancy).map((id) => [id, null]),
      ) as GameState['board']['edgeOccupancy'],
    },
  }
}

function withOwnedRoads(state: GameState, assignments: readonly (readonly [EdgeId, string])[]): GameState {
  return {
    ...state,
    board: {
      ...state.board,
      edgeOccupancy: {
        ...state.board.edgeOccupancy,
        ...Object.fromEntries(assignments.map(([edgeId, ownerId]) => [edgeId, { ownerId }])),
      } as GameState['board']['edgeOccupancy'],
    },
  }
}

describe('Task 09 scoring contracts', () => {
  it('exports the frozen standard scoring constants and plain result contracts', () => {
    expect({
      LONGEST_ROAD_MINIMUM_LENGTH,
      LARGEST_ARMY_MINIMUM_KNIGHTS,
      LONGEST_ROAD_VICTORY_POINTS,
      LARGEST_ARMY_VICTORY_POINTS,
      SETTLEMENT_VICTORY_POINTS,
      CITY_VICTORY_POINTS,
      VICTORY_POINT_CARD_POINTS,
      STANDARD_VICTORY_POINT_TARGET,
    }).toEqual({
      LONGEST_ROAD_MINIMUM_LENGTH: 5,
      LARGEST_ARMY_MINIMUM_KNIGHTS: 3,
      LONGEST_ROAD_VICTORY_POINTS: 2,
      LARGEST_ARMY_VICTORY_POINTS: 2,
      SETTLEMENT_VICTORY_POINTS: 1,
      CITY_VICTORY_POINTS: 2,
      VICTORY_POINT_CARD_POINTS: 1,
      STANDARD_VICTORY_POINT_TARGET: 10,
    })
    expectTypeOf<PlayerScoreBreakdown>().toBeObject()
    expectTypeOf<ScoringReconciliationResult>().toBeObject()
  })
})

describe('award reconciliation', () => {
  it('does not award below threshold and leaves a no-holder tie unawarded', () => {
    const below = withOwnedRoads(emptyScoringState(), SENTINEL_CHAIN.slice(0, 4).map((id) => [id, GOLDEN_PLAYER_IDS.sentinel]))
    expect(reconcileAwards(below)).toEqual({ state: below, events: [] })
    const tie = withOwnedRoads(emptyScoringState(), [
      ...SENTINEL_CHAIN.map((id) => [id, GOLDEN_PLAYER_IDS.sentinel] as const),
      ...BUILDER_CHAIN.map((id) => [id, GOLDEN_PLAYER_IDS.builder] as const),
    ])
    expect(reconcileAwards(tie)).toEqual({ state: tie, events: [] })
  })

  it('acquires, retains a tied holder, transfers on a strict lead, and emits no duplicate event', () => {
    const acquiredInput = withOwnedRoads(
      emptyScoringState(),
      SENTINEL_CHAIN.map((id) => [id, GOLDEN_PLAYER_IDS.sentinel]),
    )
    const acquired = reconcileAwards(acquiredInput)
    expect(acquired.events).toEqual([{
      type: 'LONGEST_ROAD_CHANGED', previousHolderId: null, newHolderId: GOLDEN_PLAYER_IDS.sentinel,
    }])
    expect(reconcileAwards(acquired.state)).toEqual({ state: acquired.state, events: [] })
    const tied = withOwnedRoads(
      acquired.state,
      BUILDER_CHAIN.map((id) => [id, GOLDEN_PLAYER_IDS.builder]),
    )
    expect(reconcileAwards(tied).state.awards.longestRoadHolderId).toBe(GOLDEN_PLAYER_IDS.sentinel)
    const strict = withOwnedRoads(tied, [[
      'edge:vertex:2,-1,-1|vertex:4,-2,-2' as EdgeId,
      GOLDEN_PLAYER_IDS.builder,
    ]])
    expect(reconcileAwards(strict).events).toEqual([{
      type: 'LONGEST_ROAD_CHANGED',
      previousHolderId: GOLDEN_PLAYER_IDS.sentinel,
      newHolderId: GOLDEN_PLAYER_IDS.builder,
    }])
  })

  it('transfers an interrupted route and removes it for a tied non-holder lead', () => {
    const roads = withOwnedRoads(emptyScoringState(), [
      ...SENTINEL_CHAIN.map((id) => [id, GOLDEN_PLAYER_IDS.sentinel] as const),
      ...BUILDER_CHAIN.map((id) => [id, GOLDEN_PLAYER_IDS.builder] as const),
    ])
    const held: GameState = {
      ...roads,
      awards: { ...roads.awards, longestRoadHolderId: GOLDEN_PLAYER_IDS.sentinel },
      board: {
        ...roads.board,
        vertexOccupancy: {
          ...roads.board.vertexOccupancy,
          ['vertex:-1,2,-1' as VertexId]: { type: 'SETTLEMENT', ownerId: GOLDEN_PLAYER_IDS.human },
        },
      },
    }
    const transfer = reconcileAwards(held)
    expect(transfer.state.awards.longestRoadHolderId).toBe(GOLDEN_PLAYER_IDS.builder)
    const merchantTie = withOwnedRoads(
      { ...held, awards: { ...held.awards, longestRoadHolderId: GOLDEN_PLAYER_IDS.sentinel } },
      [
        ['edge:vertex:-1,5,-4|vertex:-2,4,-2' as EdgeId, GOLDEN_PLAYER_IDS.merchant],
        ['edge:vertex:-1,5,-4|vertex:1,4,-5' as EdgeId, GOLDEN_PLAYER_IDS.merchant],
        ['edge:vertex:1,4,-5|vertex:2,2,-4' as EdgeId, GOLDEN_PLAYER_IDS.merchant],
        ['edge:vertex:2,2,-4|vertex:4,1,-5' as EdgeId, GOLDEN_PLAYER_IDS.merchant],
        ['edge:vertex:4,1,-5|vertex:5,-1,-4' as EdgeId, GOLDEN_PLAYER_IDS.merchant],
      ],
    )
    expect(reconcileAwards(merchantTie).state.awards.longestRoadHolderId).toBeNull()
  })

  it('uses played Knights, retains ties, transfers strict leads, and orders both events', () => {
    const state = withOwnedRoads(
      emptyScoringState(),
      SENTINEL_CHAIN.map((id) => [id, GOLDEN_PLAYER_IDS.sentinel]),
    )
    const sentinel = state.players[GOLDEN_PLAYER_IDS.sentinel]
    const human = state.players[GOLDEN_PLAYER_IDS.human]
    if (sentinel === undefined || human === undefined) throw new Error('Missing scoring fixture players.')
    const both: GameState = {
      ...state,
      players: {
        ...state.players,
        [GOLDEN_PLAYER_IDS.sentinel]: { ...sentinel, playedKnights: 3 },
      },
    }
    expect(reconcileAwards(both).events.map((event) => event.type)).toEqual([
      'LONGEST_ROAD_CHANGED', 'LARGEST_ARMY_CHANGED',
    ])
    const held = reconcileAwards(both).state
    const tied: GameState = {
      ...held,
      players: { ...held.players, [GOLDEN_PLAYER_IDS.human]: {
        ...human,
        playedKnights: 3,
        developmentCards: [{
          id: 'development-card:test:knight' as DevelopmentCardId,
          type: 'KNIGHT', acquiredTurnNumber: 1, status: 'IN_HAND',
        }],
      } },
    }
    expect(reconcileAwards(tied).state.awards.largestArmyHolderId).toBe(GOLDEN_PLAYER_IDS.sentinel)
    const tiedHuman = tied.players[GOLDEN_PLAYER_IDS.human]
    if (tiedHuman === undefined) throw new Error('Missing Human.')
    const strict: GameState = {
      ...tied,
      players: { ...tied.players, [GOLDEN_PLAYER_IDS.human]: {
        ...tiedHuman, playedKnights: 4,
      } },
    }
    expect(reconcileAwards(strict).state.awards.largestArmyHolderId).toBe(GOLDEN_PLAYER_IDS.human)
  })

  it('leaves a no-holder Largest Army tie unawarded and rejects unknown holders', () => {
    const state = emptyScoringState()
    const sentinel = state.players[GOLDEN_PLAYER_IDS.sentinel]
    const human = state.players[GOLDEN_PLAYER_IDS.human]
    if (sentinel === undefined || human === undefined) throw new Error('Missing players.')
    const tie: GameState = {
      ...state,
      players: {
        ...state.players,
        [GOLDEN_PLAYER_IDS.sentinel]: { ...sentinel, playedKnights: 3 },
        [GOLDEN_PLAYER_IDS.human]: { ...human, playedKnights: 3 },
      },
    }
    expect(reconcileAwards(tie)).toEqual({ state: tie, events: [] })
    expect(() => reconcileAwards({
      ...state,
      awards: { ...state.awards, longestRoadHolderId: 'player:unknown' as PlayerId },
    })).toThrow(/unknown/)
  })
})

describe('derived scoring and victory', () => {
  it('derives building, both award, hidden, revealed, and non-VP card points', () => {
    const state = emptyScoringState()
    const sentinel = state.players[GOLDEN_PLAYER_IDS.sentinel]
    if (sentinel === undefined) throw new Error('Missing Sentinel.')
    const fixture: GameState = {
      ...state,
      awards: {
        longestRoadHolderId: GOLDEN_PLAYER_IDS.sentinel,
        largestArmyHolderId: GOLDEN_PLAYER_IDS.sentinel,
      },
      board: {
        ...state.board,
        edgeOccupancy: {
          ...state.board.edgeOccupancy,
          ...Object.fromEntries(SENTINEL_CHAIN.map((id) => [id, { ownerId: GOLDEN_PLAYER_IDS.sentinel }])),
        },
        vertexOccupancy: {
          ...state.board.vertexOccupancy,
          ['vertex:-1,-1,2' as VertexId]: { type: 'SETTLEMENT', ownerId: GOLDEN_PLAYER_IDS.sentinel },
          ['vertex:-4,-4,8' as VertexId]: { type: 'CITY', ownerId: GOLDEN_PLAYER_IDS.sentinel },
        },
      },
      players: { ...state.players, [GOLDEN_PLAYER_IDS.sentinel]: {
        ...sentinel,
        playedKnights: 3,
        developmentCards: [
          { id: 'development-card:test:hidden' as DevelopmentCardId, type: 'VICTORY_POINT', acquiredTurnNumber: 1, status: 'IN_HAND' },
          { id: 'development-card:test:revealed' as DevelopmentCardId, type: 'VICTORY_POINT', acquiredTurnNumber: 1, status: 'REVEALED' },
          { id: 'development-card:test:knight' as DevelopmentCardId, type: 'KNIGHT', acquiredTurnNumber: 1, status: 'IN_HAND' },
        ],
      } },
    }
    expect(derivePlayerScore(fixture, GOLDEN_PLAYER_IDS.sentinel)).toMatchObject({
      settlementVictoryPoints: 1,
      cityVictoryPoints: 2,
      longestRoadVictoryPoints: 2,
      largestArmyVictoryPoints: 2,
      revealedVictoryPointCardPoints: 1,
      hiddenVictoryPointCardPoints: 1,
      publicVictoryPoints: 8,
      actualVictoryPoints: 9,
    })
    expect(derivePublicVictoryPoints(fixture, GOLDEN_PLAYER_IDS.sentinel)).toBe(8)
    expect(deriveActualVictoryPoints(fixture, GOLDEN_PLAYER_IDS.sentinel)).toBe(9)
  })

  it('rejects malformed scoring authority', () => {
    const state = emptyScoringState()
    const sentinel = state.players[GOLDEN_PLAYER_IDS.sentinel]
    if (sentinel === undefined) throw new Error('Missing Sentinel.')
    expect(() => assertScoringState({
      ...state,
      players: { ...state.players, [GOLDEN_PLAYER_IDS.sentinel]: { ...sentinel, playedKnights: -1 } },
    })).toThrow(/playedKnights/)
    expect(() => assertScoringState({
      ...state,
      players: { ...state.players, [GOLDEN_PLAYER_IDS.sentinel]: {
        ...sentinel,
        developmentCards: [{
          id: 'development-card:test:played-vp' as DevelopmentCardId,
          type: 'VICTORY_POINT', acquiredTurnNumber: 1, status: 'PLAYED',
        }],
      } },
    })).toThrow(/PLAYED/)
    const duplicate = STANDARD_DEVELOPMENT_DECK_SOURCE[0]
    if (duplicate === undefined) throw new Error('Missing standard development card.')
    expect(() => assertScoringState({
      ...state,
      players: { ...state.players, [GOLDEN_PLAYER_IDS.sentinel]: {
        ...sentinel,
        developmentCards: [{ ...duplicate, acquiredTurnNumber: 1, status: 'IN_HAND' }],
      } },
    })).toThrow(/duplicated/)
  })

  it('rejects impossible award holders and winner states', () => {
    const state = emptyScoringState()
    const sentinel = state.players[GOLDEN_PLAYER_IDS.sentinel]
    const human = state.players[GOLDEN_PLAYER_IDS.human]
    if (sentinel === undefined || human === undefined) throw new Error('Missing players.')
    expect(() => assertScoringState({
      ...state,
      awards: { ...state.awards, longestRoadHolderId: GOLDEN_PLAYER_IDS.sentinel },
    })).toThrow(/below 5/)
    expect(() => assertScoringState({
      ...state,
      awards: { ...state.awards, largestArmyHolderId: GOLDEN_PLAYER_IDS.sentinel },
    })).toThrow(/fewer than 3/)
    expect(() => assertScoringState({
      ...state,
      turn: { ...state.turn, phase: 'GAME_OVER' },
      winnerId: GOLDEN_PLAYER_IDS.sentinel,
    })).toThrow(/fewer than 10/)
    const winningCards = Array.from({ length: 10 }, (_, index) => ({
      id: `development-card:test:wrong-winner:${index}` as DevelopmentCardId,
      type: 'VICTORY_POINT' as const,
      acquiredTurnNumber: 1,
      status: 'REVEALED' as const,
    }))
    expect(() => assertScoringState({
      ...state,
      players: { ...state.players, [GOLDEN_PLAYER_IDS.human]: {
        ...human, developmentCards: winningCards,
      } },
      turn: { ...state.turn, phase: 'GAME_OVER' },
      winnerId: GOLDEN_PLAYER_IDS.human,
    })).toThrow(/current player/)
  })

  it('wins only for the current player, reveals hidden VP cards, and preserves version/RNG', () => {
    const state = emptyScoringState()
    const sentinel = state.players[GOLDEN_PLAYER_IDS.sentinel]
    const human = state.players[GOLDEN_PLAYER_IDS.human]
    if (sentinel === undefined || human === undefined) throw new Error('Missing players.')
    const hiddenCards = Array.from({ length: 10 }, (_, index) => ({
      id: `development-card:test:vp:${index}` as DevelopmentCardId,
      type: 'VICTORY_POINT' as const,
      acquiredTurnNumber: 1,
      status: 'IN_HAND' as const,
    }))
    const nonCurrent: GameState = {
      ...state,
      players: { ...state.players, [GOLDEN_PLAYER_IDS.human]: { ...human, developmentCards: hiddenCards } },
    }
    expect(reconcileAwardsAndCurrentPlayerVictory(nonCurrent)).toEqual({ state: nonCurrent, events: [] })
    const current: GameState = {
      ...nonCurrent,
      players: { ...nonCurrent.players,
        [GOLDEN_PLAYER_IDS.sentinel]: { ...sentinel, developmentCards: hiddenCards },
        [GOLDEN_PLAYER_IDS.human]: human,
      },
    }
    const random = current.random
    const result = reconcileAwardsAndCurrentPlayerVictory(current)
    expect(result.state.stateVersion).toBe(current.stateVersion)
    expect(result.state.random).toBe(random)
    expect(result.state).toMatchObject({ winnerId: GOLDEN_PLAYER_IDS.sentinel, turn: { phase: 'GAME_OVER' } })
    expect(result.state.players[GOLDEN_PLAYER_IDS.sentinel]?.developmentCards.every((card) => card.status === 'REVEALED')).toBe(true)
    expect(result.events).toEqual([{
      type: 'GAME_WON', winnerId: GOLDEN_PLAYER_IDS.sentinel, actualVictoryPoints: 10,
    }])
    expect(() => assertScoringState({ ...result.state, pendingDecision: {
      type: 'MOVE_ROBBER', actingPlayerId: GOLDEN_PLAYER_IDS.sentinel, cause: { type: 'DICE_SEVEN' },
    } })).toThrow()
  })

  it('wins above ten and emits the final actual score', () => {
    const state = emptyScoringState()
    const sentinel = state.players[GOLDEN_PLAYER_IDS.sentinel]
    if (sentinel === undefined) throw new Error('Missing Sentinel.')
    const fixture: GameState = {
      ...state,
      players: { ...state.players, [GOLDEN_PLAYER_IDS.sentinel]: {
        ...sentinel,
        developmentCards: Array.from({ length: 11 }, (_, index) => ({
          id: `development-card:test:above-target:${index}` as DevelopmentCardId,
          type: 'VICTORY_POINT' as const,
          acquiredTurnNumber: 1,
          status: 'IN_HAND' as const,
        })),
      } },
    }
    const result = reconcileAwardsAndCurrentPlayerVictory(fixture)
    expect(result.events).toEqual([{
      type: 'GAME_WON', winnerId: GOLDEN_PLAYER_IDS.sentinel, actualVictoryPoints: 11,
    }])
  })
})
