import type { GameEvent } from '../contracts/events.ts'
import type { GameState } from '../model/game-state.ts'
import type { CommandId, EdgeId, PlayerId, VertexId } from '../model/ids.ts'
import { deriveLongestRoadLength } from '../rules/longest-road.ts'
import { deriveActualVictoryPoints, derivePublicVictoryPoints } from '../rules/scoring.ts'
import { derivePlayerPieceCounts } from '../rules/player-piece-counts.ts'
import { executeNormalTurnLifecycleCommand } from './normal-turn-lifecycle-engine.ts'
import { executePaidBuildingCommand, type PaidBuildingCommand } from './paid-building-engine.ts'
import { GOLDEN_PLAYER_IDS } from './task-05-golden-fixture.test-helper.ts'
import { createGoldenPaidBuildingStart } from './task-08-paid-building.test-helper.ts'

const FIRST_EDGE = 'edge:vertex:-1,-1,2|vertex:1,-2,1' as EdgeId
const SECOND_EDGE = 'edge:vertex:1,-2,1|vertex:2,-1,-1' as EdgeId
const TARGET_VERTEX = 'vertex:2,-1,-1' as VertexId
const ACQUISITION_EDGE_ONE = 'edge:vertex:2,-1,-1|vertex:4,-2,-2' as EdgeId
const ACQUISITION_EDGE_TWO = 'edge:vertex:4,-2,-2|vertex:5,-4,-1' as EdgeId

function paidSuccess(
  state: GameState,
  actorId: PlayerId,
  command: PaidBuildingCommand,
): { readonly state: GameState; readonly events: readonly GameEvent[] } {
  const result = executePaidBuildingCommand(state, {
    commandId: `command:task-09:${state.stateVersion}:${command.type}` as CommandId,
    actorId,
    expectedStateVersion: state.stateVersion,
    command,
  })
  if (!result.ok) throw new Error(`Task 09 paid command failed: ${result.violation.code}.`)
  return result
}

function createTask08FinalState(): GameState {
  let state = createGoldenPaidBuildingStart()
  state = paidSuccess(state, GOLDEN_PLAYER_IDS.sentinel, {
    type: 'BUILD_ROAD', edgeId: FIRST_EDGE,
  }).state
  state = paidSuccess(state, GOLDEN_PLAYER_IDS.sentinel, {
    type: 'BUILD_ROAD', edgeId: SECOND_EDGE,
  }).state
  state = paidSuccess(state, GOLDEN_PLAYER_IDS.sentinel, {
    type: 'BUILD_SETTLEMENT', vertexId: TARGET_VERTEX,
  }).state
  return paidSuccess(state, GOLDEN_PLAYER_IDS.sentinel, {
    type: 'UPGRADE_CITY', vertexId: TARGET_VERTEX,
  }).state
}

function createGoldenRoadAcquisition(): {
  readonly state: GameState
  readonly events: readonly GameEvent[]
} {
  const base = createTask08FinalState()
  const sentinel = base.players[GOLDEN_PLAYER_IDS.sentinel]
  if (sentinel === undefined) throw new Error('Missing Sentinel.')
  let state: GameState = {
    ...base,
    players: {
      ...base.players,
      [GOLDEN_PLAYER_IDS.sentinel]: {
        ...sentinel,
        resources: { LUMBER: 2, BRICK: 2, WOOL: 0, GRAIN: 0, ORE: 0 },
      },
    },
    bank: {
      ...base.bank,
      resources: { LUMBER: 17, BRICK: 12, WOOL: 18, GRAIN: 17, ORE: 19 },
    },
  }
  const events: GameEvent[] = []
  let result = paidSuccess(state, GOLDEN_PLAYER_IDS.sentinel, {
    type: 'BUILD_ROAD', edgeId: ACQUISITION_EDGE_ONE,
  })
  state = result.state
  events.push(...result.events)
  expect(state.stateVersion).toBe(22)
  expect(deriveLongestRoadLength(state.board, GOLDEN_PLAYER_IDS.sentinel)).toBe(4)
  expect(state.awards.longestRoadHolderId).toBeNull()
  expect(result.events).toEqual([{
    type: 'ROAD_BUILT', ownerId: GOLDEN_PLAYER_IDS.sentinel,
    edgeId: ACQUISITION_EDGE_ONE, source: 'PAID_BUILD',
  }])

  result = paidSuccess(state, GOLDEN_PLAYER_IDS.sentinel, {
    type: 'BUILD_ROAD', edgeId: ACQUISITION_EDGE_TWO,
  })
  events.push(...result.events)
  return { state: result.state, events }
}

describe('Task 09 command integration', () => {
  it('preserves the accepted Task 08 four-command replay without score events', () => {
    const state = createTask08FinalState()
    expect(state).toMatchObject({
      stateVersion: 21,
      awards: { longestRoadHolderId: null, largestArmyHolderId: null },
      winnerId: null,
    })
  })

  it('replays the exact golden paid-road Longest Road acquisition', () => {
    const result = createGoldenRoadAcquisition()
    expect(result.state).toMatchObject({
      stateVersion: 23,
      awards: { longestRoadHolderId: GOLDEN_PLAYER_IDS.sentinel },
      random: { state: 1264537981, drawCount: 86 },
      winnerId: null,
    })
    expect(derivePlayerPieceCounts(result.state.board, GOLDEN_PLAYER_IDS.sentinel).roads).toBe(6)
    expect(deriveLongestRoadLength(result.state.board, GOLDEN_PLAYER_IDS.sentinel)).toBe(5)
    expect(derivePublicVictoryPoints(result.state, GOLDEN_PLAYER_IDS.sentinel)).toBe(6)
    expect(deriveActualVictoryPoints(result.state, GOLDEN_PLAYER_IDS.sentinel)).toBe(6)
    expect(result.state.players[GOLDEN_PLAYER_IDS.sentinel]?.resources).toEqual({
      LUMBER: 0, BRICK: 0, WOOL: 0, GRAIN: 0, ORE: 0,
    })
    expect(result.state.bank.resources).toEqual({
      LUMBER: 19, BRICK: 14, WOOL: 18, GRAIN: 17, ORE: 19,
    })
    expect(result.events.map((event) => event.type)).toEqual([
      'ROAD_BUILT', 'ROAD_BUILT', 'LONGEST_ROAD_CHANGED',
    ])
  })

  it('replays the exact paid-city victory at ten points', () => {
    const acquired = createGoldenRoadAcquisition().state
    const sentinel = acquired.players[GOLDEN_PLAYER_IDS.sentinel]
    if (sentinel === undefined) throw new Error('Missing Sentinel.')
    const fixture: GameState = {
      ...acquired,
      board: {
        ...acquired.board,
        vertexOccupancy: {
          ...acquired.board.vertexOccupancy,
          ['vertex:-1,-1,2' as VertexId]: { type: 'CITY', ownerId: GOLDEN_PLAYER_IDS.sentinel },
          ['vertex:-4,-4,8' as VertexId]: { type: 'CITY', ownerId: GOLDEN_PLAYER_IDS.sentinel },
          ['vertex:5,-4,-1' as VertexId]: { type: 'SETTLEMENT', ownerId: GOLDEN_PLAYER_IDS.sentinel },
        },
      },
      players: { ...acquired.players, [GOLDEN_PLAYER_IDS.sentinel]: {
        ...sentinel,
        resources: { LUMBER: 0, BRICK: 0, WOOL: 0, GRAIN: 2, ORE: 3 },
      } },
      bank: { ...acquired.bank, resources: {
        LUMBER: 19, BRICK: 14, WOOL: 18, GRAIN: 15, ORE: 16,
      } },
    }
    expect(derivePublicVictoryPoints(fixture, GOLDEN_PLAYER_IDS.sentinel)).toBe(9)
    const result = paidSuccess(fixture, GOLDEN_PLAYER_IDS.sentinel, {
      type: 'UPGRADE_CITY', vertexId: 'vertex:5,-4,-1' as VertexId,
    })
    expect(result.state).toMatchObject({
      stateVersion: 24,
      winnerId: GOLDEN_PLAYER_IDS.sentinel,
      turn: { phase: 'GAME_OVER', currentPlayerId: GOLDEN_PLAYER_IDS.sentinel, turnNumber: 1 },
      pendingDecision: null,
      random: { state: 1264537981, drawCount: 86 },
    })
    expect(derivePlayerPieceCounts(result.state.board, GOLDEN_PLAYER_IDS.sentinel)).toEqual({
      roads: 6, settlements: 0, cities: 4,
    })
    expect(deriveActualVictoryPoints(result.state, GOLDEN_PLAYER_IDS.sentinel)).toBe(10)
    expect(result.events).toEqual([
      { type: 'CITY_BUILT', ownerId: GOLDEN_PLAYER_IDS.sentinel, vertexId: 'vertex:5,-4,-1' },
      { type: 'GAME_WON', winnerId: GOLDEN_PLAYER_IDS.sentinel, actualVictoryPoints: 10 },
    ])
  })

  it('transfers Longest Road when a paid settlement interrupts the holder', () => {
    const base = createGoldenPaidBuildingStart()
    const human = base.players[GOLDEN_PLAYER_IDS.human]
    if (human === undefined) throw new Error('Missing Human.')
    const sentinelEdges: readonly EdgeId[] = [
      'edge:vertex:-1,-1,2|vertex:-2,1,1',
      'edge:vertex:-1,2,-1|vertex:-2,1,1',
      'edge:vertex:-1,2,-1|vertex:1,1,-2',
      'edge:vertex:1,1,-2|vertex:2,-1,-1',
      'edge:vertex:1,-2,1|vertex:2,-1,-1',
    ].map((edgeId) => edgeId as EdgeId)
    const builderEdges: readonly EdgeId[] = [
      'edge:vertex:-1,-4,5|vertex:1,-5,4',
      'edge:vertex:1,-5,4|vertex:2,-4,2',
      'edge:vertex:2,-4,2|vertex:4,-5,1',
      'edge:vertex:4,-5,1|vertex:5,-4,-1',
      'edge:vertex:4,-2,-2|vertex:5,-4,-1',
    ].map((edgeId) => edgeId as EdgeId)
    const fixture: GameState = {
      ...base,
      turn: { ...base.turn, currentPlayerId: GOLDEN_PLAYER_IDS.human },
      awards: { ...base.awards, longestRoadHolderId: GOLDEN_PLAYER_IDS.sentinel },
      board: {
        ...base.board,
        vertexOccupancy: Object.fromEntries(
          Object.keys(base.board.vertexOccupancy).map((id) => [id, null]),
        ) as GameState['board']['vertexOccupancy'],
        edgeOccupancy: {
          ...Object.fromEntries(Object.keys(base.board.edgeOccupancy).map((id) => [id, null])),
          ...Object.fromEntries(sentinelEdges.map((id) => [id, { ownerId: GOLDEN_PLAYER_IDS.sentinel }])),
          ...Object.fromEntries(builderEdges.map((id) => [id, { ownerId: GOLDEN_PLAYER_IDS.builder }])),
          ['edge:vertex:-1,2,-1|vertex:-2,4,-2' as EdgeId]: { ownerId: GOLDEN_PLAYER_IDS.human },
        } as GameState['board']['edgeOccupancy'],
      },
      players: { ...base.players, [GOLDEN_PLAYER_IDS.human]: {
        ...human,
        resources: { LUMBER: 1, BRICK: 1, WOOL: 1, GRAIN: 1, ORE: 0 },
      } },
      bank: { ...base.bank, resources: {
        ...base.bank.resources,
        LUMBER: base.bank.resources.LUMBER - 1,
      } },
    }
    const result = paidSuccess(fixture, GOLDEN_PLAYER_IDS.human, {
      type: 'BUILD_SETTLEMENT', vertexId: 'vertex:-1,2,-1' as VertexId,
    })
    expect(deriveLongestRoadLength(result.state.board, GOLDEN_PLAYER_IDS.sentinel)).toBe(3)
    expect(result.state.awards.longestRoadHolderId).toBe(GOLDEN_PLAYER_IDS.builder)
    expect(result.events).toEqual([
      { type: 'SETTLEMENT_BUILT', ownerId: GOLDEN_PLAYER_IDS.human, vertexId: 'vertex:-1,2,-1', source: 'PAID_BUILD' },
      { type: 'LONGEST_ROAD_CHANGED', previousHolderId: GOLDEN_PLAYER_IDS.sentinel, newHolderId: GOLDEN_PLAYER_IDS.builder },
    ])
  })

  it('wins at turn start with five hidden VP cards and no RNG draw', () => {
    const base = createGoldenPaidBuildingStart()
    const human = base.players[GOLDEN_PLAYER_IDS.human]
    if (human === undefined) throw new Error('Missing Human.')
    const vpIds = base.bank.developmentDeck
      .filter((card) => card.type === 'VICTORY_POINT')
      .map((card) => card.id)
    const vpIdSet = new Set(vpIds)
    const fixture: GameState = {
      ...base,
      board: {
        ...base.board,
        vertexOccupancy: {
          ...Object.fromEntries(Object.keys(base.board.vertexOccupancy).map((id) => [id, null])),
          ['vertex:-1,-4,5' as VertexId]: { type: 'CITY', ownerId: GOLDEN_PLAYER_IDS.human },
          ['vertex:-1,8,-7' as VertexId]: { type: 'CITY', ownerId: GOLDEN_PLAYER_IDS.human },
          ['vertex:5,-4,-1' as VertexId]: { type: 'SETTLEMENT', ownerId: GOLDEN_PLAYER_IDS.human },
        } as GameState['board']['vertexOccupancy'],
        edgeOccupancy: Object.fromEntries(
          Object.keys(base.board.edgeOccupancy).map((id) => [id, null]),
        ) as GameState['board']['edgeOccupancy'],
      },
      bank: {
        ...base.bank,
        developmentDeck: base.bank.developmentDeck.filter((card) => !vpIdSet.has(card.id)),
      },
      players: { ...base.players, [GOLDEN_PLAYER_IDS.human]: {
        ...human,
        developmentCards: base.bank.developmentDeck
          .filter((card) => vpIdSet.has(card.id))
          .map((card) => ({ ...card, acquiredTurnNumber: 1, status: 'IN_HAND' as const })),
      } },
    }
    expect(derivePublicVictoryPoints(fixture, GOLDEN_PLAYER_IDS.human)).toBe(5)
    expect(deriveActualVictoryPoints(fixture, GOLDEN_PLAYER_IDS.human)).toBe(10)
    const random = fixture.random
    const result = executeNormalTurnLifecycleCommand(fixture, {
      commandId: 'command:task-09:hidden-turn-start' as CommandId,
      actorId: GOLDEN_PLAYER_IDS.sentinel,
      expectedStateVersion: fixture.stateVersion,
      command: { type: 'END_TURN' },
    })
    if (!result.ok) throw new Error(`Hidden-card turn-start failed: ${result.violation.code}.`)
    expect(result.state.stateVersion).toBe(fixture.stateVersion + 1)
    expect(result.state.random).toBe(random)
    expect(result.state).toMatchObject({
      winnerId: GOLDEN_PLAYER_IDS.human,
      turn: { currentPlayerId: GOLDEN_PLAYER_IDS.human, phase: 'GAME_OVER' },
    })
    expect(result.state.players[GOLDEN_PLAYER_IDS.human]?.developmentCards.every((card) => card.status === 'REVEALED')).toBe(true)
    expect(derivePublicVictoryPoints(result.state, GOLDEN_PLAYER_IDS.human)).toBe(10)
    expect(result.events).toEqual([
      { type: 'TURN_ENDED', playerId: GOLDEN_PLAYER_IDS.sentinel, turnNumber: 1 },
      { type: 'TURN_STARTED', playerId: GOLDEN_PLAYER_IDS.human, turnNumber: 2 },
      { type: 'GAME_WON', winnerId: GOLDEN_PLAYER_IDS.human, actualVictoryPoints: 10 },
    ])
  })
})
