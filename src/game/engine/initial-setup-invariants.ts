import { assertStandardBoardTopology } from '../board/topology-invariants.ts'
import type { GameState } from '../model/game-state.ts'
import type { EdgeId, PlayerId, VertexId } from '../model/ids.ts'
import { RESOURCE_TYPES } from '../model/resource.ts'
import { GAME_STATE_SCHEMA_VERSION, RULESET_ID } from '../model/ruleset.ts'

function assertInvariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid initial setup state: ${message}`)
}

function assertResourceCounts(state: GameState): void {
  for (const resource of RESOURCE_TYPES) {
    const bankCount = state.bank.resources[resource]
    assertInvariant(Number.isInteger(bankCount) && bankCount >= 0, `bank ${resource} must be a non-negative integer.`)
  }
  for (const player of Object.values(state.players)) {
    for (const resource of RESOURCE_TYPES) {
      const count = player.resources[resource]
      assertInvariant(Number.isInteger(count) && count >= 0, `player ${player.id} ${resource} must be a non-negative integer.`)
    }
  }
}

function assertOccupancy(state: GameState): void {
  const topologyVertexIds = Object.keys(state.board.topology.vertices) as VertexId[]
  const occupancyVertexIds = Object.keys(state.board.vertexOccupancy) as VertexId[]
  assertInvariant(occupancyVertexIds.length === topologyVertexIds.length, 'vertex occupancy key count must match topology.')
  for (const vertexId of occupancyVertexIds) {
    assertInvariant(state.board.topology.vertices[vertexId] !== undefined, `vertex occupancy contains unknown ID ${vertexId}.`)
    const building = state.board.vertexOccupancy[vertexId]
    if (building !== null && building !== undefined) {
      assertInvariant(state.players[building.ownerId] !== undefined, `vertex ${vertexId} has unknown owner ${building.ownerId}.`)
      assertInvariant(building.type === 'SETTLEMENT' || building.type === 'CITY', `vertex ${vertexId} has invalid building type.`)
    }
  }
  for (const vertexId of topologyVertexIds) {
    assertInvariant(Object.hasOwn(state.board.vertexOccupancy, vertexId), `vertex occupancy is missing ${vertexId}.`)
  }

  const topologyEdgeIds = Object.keys(state.board.topology.edges) as EdgeId[]
  const occupancyEdgeIds = Object.keys(state.board.edgeOccupancy) as EdgeId[]
  assertInvariant(occupancyEdgeIds.length === topologyEdgeIds.length, 'edge occupancy key count must match topology.')
  for (const edgeId of occupancyEdgeIds) {
    assertInvariant(state.board.topology.edges[edgeId] !== undefined, `edge occupancy contains unknown ID ${edgeId}.`)
    const road = state.board.edgeOccupancy[edgeId]
    if (road !== null && road !== undefined) {
      assertInvariant(state.players[road.ownerId] !== undefined, `edge ${edgeId} has unknown owner ${road.ownerId}.`)
    }
  }
  for (const edgeId of topologyEdgeIds) {
    assertInvariant(Object.hasOwn(state.board.edgeOccupancy, edgeId), `edge occupancy is missing ${edgeId}.`)
  }
}

function expectedSetupPlayerId(state: GameState, round: number, placementIndex: number): PlayerId {
  const orderIndex = round === 1 ? placementIndex : 3 - placementIndex
  const playerId = state.playerOrder[orderIndex]
  assertInvariant(playerId !== undefined, `cannot resolve setup player for round ${round} index ${placementIndex}.`)
  return playerId
}

export function assertInitialSetupState(state: GameState): void {
  assertInvariant(state.schemaVersion === GAME_STATE_SCHEMA_VERSION, 'schema version mismatch.')
  assertInvariant(state.rulesetId === RULESET_ID, 'ruleset mismatch.')
  assertInvariant(Number.isSafeInteger(state.stateVersion) && state.stateVersion >= 0, 'stateVersion must be non-negative.')
  assertStandardBoardTopology(state.board.topology)

  const playerIds = Object.keys(state.players) as PlayerId[]
  assertInvariant(playerIds.length === 4, 'players must contain exactly four records.')
  assertInvariant(state.playerOrder.length === 4 && new Set(state.playerOrder).size === 4, 'playerOrder must contain four unique IDs.')
  for (const playerId of state.playerOrder) {
    assertInvariant(state.players[playerId] !== undefined, `playerOrder references unknown player ${playerId}.`)
  }
  assertInvariant(state.players[state.turn.currentPlayerId] !== undefined, `current player ${state.turn.currentPlayerId} is unknown.`)
  assertResourceCounts(state)
  assertOccupancy(state)

  const isSetupPhase = state.turn.phase === 'SETUP_SETTLEMENT' || state.turn.phase === 'SETUP_ROAD'
  if (!isSetupPhase) return

  assertInvariant(state.winnerId === null, 'setup cannot have a winner.')
  assertInvariant(state.pendingDecision === null, 'setup cannot have a pending decision.')
  assertInvariant(state.turn.turnNumber === 0, 'setup must use turn number zero.')
  const setup = state.turn.setup
  assertInvariant(setup !== null, `${state.turn.phase} requires setup state.`)
  assertInvariant(setup.round === 1 || setup.round === 2, `setup round must be 1 or 2; found ${setup.round}.`)
  assertInvariant(Number.isInteger(setup.placementIndex) && setup.placementIndex >= 0 && setup.placementIndex <= 3, `placementIndex must be 0..3; found ${setup.placementIndex}.`)
  const expectedPlayerId = expectedSetupPlayerId(state, setup.round, setup.placementIndex)
  assertInvariant(state.turn.currentPlayerId === expectedPlayerId, `current player must be ${expectedPlayerId} for round ${setup.round} index ${setup.placementIndex}.`)

  if (state.turn.phase === 'SETUP_SETTLEMENT') {
    assertInvariant(setup.pendingSettlementVertexId === null, 'SETUP_SETTLEMENT must not have a pending vertex.')
    return
  }

  const pendingVertexId = setup.pendingSettlementVertexId
  assertInvariant(pendingVertexId !== null, 'SETUP_ROAD requires a pending settlement vertex.')
  assertInvariant(state.board.topology.vertices[pendingVertexId] !== undefined, `pending vertex ${pendingVertexId} is unknown.`)
  const building = state.board.vertexOccupancy[pendingVertexId]
  assertInvariant(building !== null && building !== undefined, `pending vertex ${pendingVertexId} is empty.`)
  assertInvariant(building.type === 'SETTLEMENT', `pending vertex ${pendingVertexId} must contain a settlement.`)
  assertInvariant(building.ownerId === state.turn.currentPlayerId, `pending settlement ${pendingVertexId} is owned by another player.`)
}
