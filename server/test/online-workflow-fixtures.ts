/** Invariant-valid Node fixtures. This module is never imported by production entry points. */
import type { GameConfig } from '@frontier-isles/game-core/model/game-config'
import type { GameState } from '@frontier-isles/game-core/model/game-state'
import type { DevelopmentCardType } from '@frontier-isles/game-core/model/development-card'
import type { EdgeId, PlayerId, TileId, VertexId } from '@frontier-isles/game-core/model/ids'
import { createEmptyResourceBag } from '@frontier-isles/game-core/model/resource'
import { createCompletedGoldenSetup } from '@frontier-isles/game-core/engine/task-05-golden-fixture.test-helper'
import { createBalancedControlledRollInput } from '@frontier-isles/game-core/engine/task-07-controlled-seven.test-helper'
import { createGoldenPaidBuildingStart } from '@frontier-isles/game-core/engine/task-08-paid-building.test-helper'
import { createTask08FinalState, moveStandardCardToPlayer } from '@frontier-isles/game-core/engine/task-10-development-card.test-helper'
import { assertTradingState } from '@frontier-isles/game-core/engine/trading-invariants'
import { reconcileAwards } from '@frontier-isles/game-core/engine/scoring-reconciliation'
import { rollDice } from '@frontier-isles/game-core/random/roll-dice'
import { requireValue, withHands } from './game-test-helpers.js'

export const WORKFLOW_SCENARIOS = ['BUILD_TRADE', 'SEVEN', 'KNIGHT', 'ROAD_BUILDING', 'INVENTION', 'MONOPOLY',
  'FREE_ROAD_FINISH', 'LONGEST_ROAD', 'VICTORY', 'PRODUCTION', 'MULTI_SHORTAGE', 'SINGLE_SHORTAGE', 'AI_TRADE'] as const
export type WorkflowScenario = typeof WORKFLOW_SCENARIOS[number]

function remap(base: GameState, config: GameConfig): GameState {
  if (base.pendingDecision !== null || base.turn.setup !== null) throw new Error('Remap requires a completed, non-pending fixture.')
  const ids = new Map(base.playerOrder.map((id, index) => [id, requireValue(config.players[index]).id]))
  const playerId = (id: PlayerId): PlayerId => requireValue(ids.get(id))
  const [north, east, south, west] = config.players
  return {
    ...base, gameId: config.gameId, playerOrder: [north.id, east.id, south.id, west.id],
    players: Object.fromEntries(base.playerOrder.map((id, index) => [playerId(id), {
      ...requireValue(base.players[id]), ...requireValue(config.players[index]),
    }])),
    board: { ...base.board,
      vertexOccupancy: Object.fromEntries(Object.entries(base.board.vertexOccupancy).map(([id, piece]) => [id,
        piece === null ? null : { ...piece, ownerId: playerId(piece.ownerId) }])) as GameState['board']['vertexOccupancy'],
      edgeOccupancy: Object.fromEntries(Object.entries(base.board.edgeOccupancy).map(([id, piece]) => [id,
        piece === null ? null : { ownerId: playerId(piece.ownerId) }])) as GameState['board']['edgeOccupancy'],
    },
    turn: { ...base.turn, currentPlayerId: playerId(base.turn.currentPlayerId) },
    awards: { longestRoadHolderId: base.awards.longestRoadHolderId === null ? null : playerId(base.awards.longestRoadHolderId),
      largestArmyHolderId: base.awards.largestArmyHolderId === null ? null : playerId(base.awards.largestArmyHolderId) },
    winnerId: base.winnerId === null ? null : playerId(base.winnerId),
  }
}

function withEightNext(state: GameState): GameState {
  for (let cursor = 1; cursor <= 1_000; cursor += 1) {
    const random = { ...state.random, state: cursor }
    if (rollDice(random).value.total === 8) return { ...state, random }
  }
  throw new Error('No bounded eight-roll fixture found.')
}

function cardState(config: GameConfig, type: DevelopmentCardType): GameState {
  const state = remap(createGoldenPaidBuildingStart(), config)
  return moveStandardCardToPlayer(state, config.players[0].id, type, 'IN_HAND', 0)
}

function freeRoadFinish(config: GameConfig): GameState {
  const state = cardState(config, 'ROAD_BUILDING')
  const topology = state.board.topology
  const coastal = requireValue(Object.values(topology.vertices).find((vertex) => vertex.edgeIds.length === 2))
  const edgeId = requireValue(coastal.edgeIds[0])
  const edge = requireValue(topology.edges[edgeId])
  const other = requireValue(topology.vertices[requireValue(edge.vertexIds.find((id) => id !== coastal.id))])
  const blockers = [requireValue(coastal.edgeIds[1]), ...other.edgeIds.filter((id) => id !== edgeId)]
  return { ...state, board: { ...state.board,
    vertexOccupancy: { ...Object.fromEntries(Object.keys(state.board.vertexOccupancy).map((id) => [id, null])),
      [coastal.id]: { type: 'SETTLEMENT', ownerId: config.players[0].id } } as GameState['board']['vertexOccupancy'],
    edgeOccupancy: { ...Object.fromEntries(Object.keys(state.board.edgeOccupancy).map((id) => [id, null])),
      ...Object.fromEntries(blockers.map((id) => [id, { ownerId: config.players[1].id }])) } as GameState['board']['edgeOccupancy'],
  } }
}

export function workflowFixture(scenario: WorkflowScenario, config: GameConfig): GameState {
  const [north, east, south, west] = config.players
  const empty = createEmptyResourceBag()
  let state: GameState
  switch (scenario) {
    case 'BUILD_TRADE':
      state = withHands(remap(createGoldenPaidBuildingStart(), config), {
        [north.id]: { LUMBER: 8, BRICK: 8, WOOL: 3, GRAIN: 7, ORE: 7 },
        [east.id]: { LUMBER: 4, BRICK: 4, WOOL: 2, GRAIN: 2, ORE: 2 },
        [south.id]: { LUMBER: 1, BRICK: 2, WOOL: 1, GRAIN: 1, ORE: 1 },
        [west.id]: { LUMBER: 1, BRICK: 1, WOOL: 1, GRAIN: 1, ORE: 1 },
      })
      break
    case 'SEVEN':
      state = remap(createBalancedControlledRollInput(), config)
      break
    case 'AI_TRADE':
      state = withHands(remap(createGoldenPaidBuildingStart(), config), {
        [north.id]: { LUMBER: 1, BRICK: 1, WOOL: 1, GRAIN: 1, ORE: 1 },
        [east.id]: { LUMBER: 4, BRICK: 4, WOOL: 4, GRAIN: 4, ORE: 4 },
        [south.id]: { ...empty, LUMBER: 2, WOOL: 3 },
      })
      state = { ...state, turn: { ...state.turn, currentPlayerId: south.id } }
      break
    case 'KNIGHT':
      state = cardState(config, 'KNIGHT')
      state = moveStandardCardToPlayer(state, north.id, 'KNIGHT', 'PLAYED', 0)
      state = moveStandardCardToPlayer(state, north.id, 'KNIGHT', 'PLAYED', 0)
      break
    case 'ROAD_BUILDING':
    case 'INVENTION':
    case 'MONOPOLY':
      state = cardState(config, scenario)
      break
    case 'FREE_ROAD_FINISH':
      state = freeRoadFinish(config)
      break
    case 'LONGEST_ROAD': {
      state = remap(createGoldenPaidBuildingStart(), config)
      const chain = ['edge:vertex:-1,-1,2|vertex:-2,1,1', 'edge:vertex:-1,2,-1|vertex:-2,1,1',
        'edge:vertex:-1,2,-1|vertex:1,1,-2', 'edge:vertex:1,1,-2|vertex:2,-1,-1'] as EdgeId[]
      state = { ...state, board: { ...state.board,
        vertexOccupancy: { ...Object.fromEntries(Object.keys(state.board.vertexOccupancy).map((id) => [id, null])),
          ['vertex:-1,-1,2' as VertexId]: { type: 'SETTLEMENT', ownerId: north.id } } as GameState['board']['vertexOccupancy'],
        edgeOccupancy: { ...Object.fromEntries(Object.keys(state.board.edgeOccupancy).map((id) => [id, null])),
          ...Object.fromEntries(chain.map((id) => [id, { ownerId: north.id }])) } as GameState['board']['edgeOccupancy'],
      } }
      break
    }
    case 'VICTORY':
      state = remap(createTask08FinalState(), config)
      for (let index = 0; index < 5; index += 1) state = moveStandardCardToPlayer(state, north.id, 'VICTORY_POINT')
      state = withHands(state, { [north.id]: { ...empty, GRAIN: 2, ORE: 3 } })
      break
    case 'PRODUCTION':
      state = withEightNext(remap(createCompletedGoldenSetup(), config))
      break
    case 'MULTI_SHORTAGE':
      state = withEightNext(withHands(remap(createCompletedGoldenSetup(), config), { [south.id]: { ...empty, GRAIN: 16 } }))
      break
    case 'SINGLE_SHORTAGE':
      state = withEightNext(withHands(remap(createCompletedGoldenSetup(), config), { [south.id]: { ...empty, GRAIN: 18 } }))
      state = { ...state, board: { ...state.board, robberTileId: 'tile:-1,1' as TileId } }
      break
  }
  state = reconcileAwards(state).state
  assertTradingState(state)
  return state
}
