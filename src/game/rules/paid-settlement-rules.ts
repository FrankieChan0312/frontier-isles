import type { RuleViolation } from '../contracts/errors.ts'
import type { GameState } from '../model/game-state.ts'
import type { PlayerId, VertexId } from '../model/ids.ts'
import { STANDARD_SETTLEMENT_COST } from '../model/standard-build-costs.ts'
import { STANDARD_SETTLEMENT_PIECE_LIMIT } from '../model/standard-piece-limits.ts'
import { derivePlayerPieceCounts } from './player-piece-counts.ts'
import { canAffordResourceCost } from './resource-payment.ts'

export function validatePaidSettlementPlacement(
  state: GameState,
  actorId: PlayerId,
  vertexId: VertexId,
): RuleViolation | null {
  const vertex = state.board.topology.vertices[vertexId]
  if (vertex === undefined || state.board.vertexOccupancy[vertexId] !== null) {
    return { code: 'ILLEGAL_VERTEX', details: { vertexId } }
  }
  if (vertex.adjacentVertexIds.some(
    (adjacentVertexId) => state.board.vertexOccupancy[adjacentVertexId] !== null,
  )) {
    return { code: 'DISTANCE_RULE_VIOLATION', details: { vertexId } }
  }
  if (!vertex.edgeIds.some(
    (edgeId) => state.board.edgeOccupancy[edgeId]?.ownerId === actorId,
  )) {
    return { code: 'ROAD_NOT_CONNECTED', details: { vertexId } }
  }
  if (
    derivePlayerPieceCounts(state.board, actorId).settlements
    >= STANDARD_SETTLEMENT_PIECE_LIMIT
  ) {
    return { code: 'INSUFFICIENT_PIECES', details: { piece: 'SETTLEMENT' } }
  }
  const player = state.players[actorId]
  if (player === undefined) {
    throw new Error(`Cannot validate settlement payment for unknown player ${actorId}.`)
  }
  if (!canAffordResourceCost(player.resources, STANDARD_SETTLEMENT_COST)) {
    return { code: 'INSUFFICIENT_RESOURCES' }
  }
  return null
}
