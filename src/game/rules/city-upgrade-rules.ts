import type { RuleViolation } from '../contracts/errors.ts'
import type { GameState } from '../model/game-state.ts'
import type { PlayerId, VertexId } from '../model/ids.ts'
import { STANDARD_CITY_COST } from '../model/standard-build-costs.ts'
import { STANDARD_CITY_PIECE_LIMIT } from '../model/standard-piece-limits.ts'
import { derivePlayerPieceCounts } from './player-piece-counts.ts'
import { canAffordResourceCost } from './resource-payment.ts'

export function validateCityUpgrade(
  state: GameState,
  actorId: PlayerId,
  vertexId: VertexId,
): RuleViolation | null {
  const vertex = state.board.topology.vertices[vertexId]
  const building = state.board.vertexOccupancy[vertexId]
  if (
    vertex === undefined
    || building?.type !== 'SETTLEMENT'
    || building.ownerId !== actorId
  ) {
    return { code: 'ILLEGAL_VERTEX', details: { vertexId } }
  }
  if (derivePlayerPieceCounts(state.board, actorId).cities >= STANDARD_CITY_PIECE_LIMIT) {
    return { code: 'INSUFFICIENT_PIECES', details: { piece: 'CITY' } }
  }
  const player = state.players[actorId]
  if (player === undefined) throw new Error(`Cannot validate city payment for unknown player ${actorId}.`)
  if (!canAffordResourceCost(player.resources, STANDARD_CITY_COST)) {
    return { code: 'INSUFFICIENT_RESOURCES' }
  }
  return null
}
