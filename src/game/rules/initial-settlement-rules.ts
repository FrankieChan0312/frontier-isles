import type { RuleViolation } from '../contracts/errors.ts'
import type { GameState } from '../model/game-state.ts'
import type { PlayerId, VertexId } from '../model/ids.ts'

export function validateInitialSettlement(
  state: GameState,
  actorId: PlayerId,
  vertexId: VertexId,
): RuleViolation | null {
  const vertex = state.board.topology.vertices[vertexId]
  if (vertex === undefined || state.board.vertexOccupancy[vertexId] !== null) {
    return { code: 'ILLEGAL_VERTEX', details: { vertexId } }
  }
  if (vertex.adjacentVertexIds.some((adjacentId) => state.board.vertexOccupancy[adjacentId] !== null)) {
    return { code: 'DISTANCE_RULE_VIOLATION', details: { vertexId } }
  }
  const settlementCount = Object.values(state.board.vertexOccupancy).filter(
    (building) => building?.type === 'SETTLEMENT' && building.ownerId === actorId,
  ).length
  if (settlementCount >= 5) {
    return { code: 'INSUFFICIENT_PIECES', details: { piece: 'SETTLEMENT' } }
  }
  return null
}
