import type { RuleViolation } from '../contracts/errors.ts'
import type { GameState } from '../model/game-state.ts'
import type { EdgeId, PlayerId, VertexId } from '../model/ids.ts'
import { STANDARD_ROAD_COST } from '../model/standard-build-costs.ts'
import { STANDARD_ROAD_PIECE_LIMIT } from '../model/standard-piece-limits.ts'
import { canAffordResourceCost } from './resource-payment.ts'
import { derivePlayerPieceCounts } from './player-piece-counts.ts'

export type PaidRoadConnection = 'CONNECTED' | 'BLOCKED' | 'DISCONNECTED'

function hasActorRoadAtVertex(
  state: GameState,
  actorId: PlayerId,
  vertexId: VertexId,
  targetEdgeId: EdgeId,
): boolean {
  const vertex = state.board.topology.vertices[vertexId]
  if (vertex === undefined) throw new Error(`Cannot inspect unknown road endpoint ${vertexId}.`)
  return vertex.edgeIds.some(
    (edgeId) => edgeId !== targetEdgeId
      && state.board.edgeOccupancy[edgeId]?.ownerId === actorId,
  )
}

export function classifyPaidRoadConnection(
  state: GameState,
  actorId: PlayerId,
  edgeId: EdgeId,
): PaidRoadConnection {
  const edge = state.board.topology.edges[edgeId]
  if (edge === undefined) throw new Error(`Cannot classify unknown edge ${edgeId}.`)

  let blocked = false
  for (const vertexId of edge.vertexIds) {
    const building = state.board.vertexOccupancy[vertexId]
    if (building?.ownerId === actorId) return 'CONNECTED'

    const hasActorRoad = hasActorRoadAtVertex(state, actorId, vertexId, edgeId)
    if (building === null) {
      if (hasActorRoad) return 'CONNECTED'
    } else if (building !== undefined && hasActorRoad) {
      blocked = true
    }
  }
  return blocked ? 'BLOCKED' : 'DISCONNECTED'
}

export function validatePaidRoadPlacement(
  state: GameState,
  actorId: PlayerId,
  edgeId: EdgeId,
): RuleViolation | null {
  const placementViolation = validateFreeRoadPlacement(state, actorId, edgeId)
  if (placementViolation !== null) return placementViolation
  const player = state.players[actorId]
  if (player === undefined) throw new Error(`Cannot validate road payment for unknown player ${actorId}.`)
  if (!canAffordResourceCost(player.resources, STANDARD_ROAD_COST)) {
    return { code: 'INSUFFICIENT_RESOURCES' }
  }
  return null
}

export function validateFreeRoadPlacement(
  state: GameState,
  actorId: PlayerId,
  edgeId: EdgeId,
): RuleViolation | null {
  if (
    state.board.topology.edges[edgeId] === undefined
    || state.board.edgeOccupancy[edgeId] !== null
  ) {
    return { code: 'ILLEGAL_EDGE', details: { edgeId } }
  }
  const connection = classifyPaidRoadConnection(state, actorId, edgeId)
  if (connection === 'BLOCKED') return { code: 'ROAD_BLOCKED', details: { edgeId } }
  if (connection === 'DISCONNECTED') return { code: 'ROAD_NOT_CONNECTED', details: { edgeId } }
  if (derivePlayerPieceCounts(state.board, actorId).roads >= STANDARD_ROAD_PIECE_LIMIT) {
    return { code: 'INSUFFICIENT_PIECES', details: { piece: 'ROAD' } }
  }
  return null
}
