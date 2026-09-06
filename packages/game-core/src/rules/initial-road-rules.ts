import type { RuleViolation } from '../contracts/errors.ts'
import type { GameState } from '../model/game-state.ts'
import type { EdgeId, PlayerId, VertexId } from '../model/ids.ts'

export function validateInitialRoad(
  state: GameState,
  actorId: PlayerId,
  edgeId: EdgeId,
  pendingVertexId: VertexId,
): RuleViolation | null {
  const edge = state.board.topology.edges[edgeId]
  if (edge === undefined || state.board.edgeOccupancy[edgeId] !== null) {
    return { code: 'ILLEGAL_EDGE', details: { edgeId } }
  }
  if (!edge.vertexIds.includes(pendingVertexId)) {
    return { code: 'ROAD_NOT_CONNECTED', details: { edgeId, vertexId: pendingVertexId } }
  }
  const roadCount = Object.values(state.board.edgeOccupancy).filter(
    (road) => road?.ownerId === actorId,
  ).length
  if (roadCount >= 15) {
    return { code: 'INSUFFICIENT_PIECES', details: { piece: 'ROAD' } }
  }
  return null
}
