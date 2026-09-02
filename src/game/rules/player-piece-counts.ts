import type { BoardState } from '../model/board-state.ts'
import type { PlayerId } from '../model/ids.ts'

export interface PlayerPieceCounts {
  readonly roads: number
  readonly settlements: number
  readonly cities: number
}

export function derivePlayerPieceCounts(
  board: BoardState,
  playerId: PlayerId,
): PlayerPieceCounts {
  let roads = 0
  let settlements = 0
  let cities = 0

  for (const road of Object.values(board.edgeOccupancy)) {
    if (road?.ownerId === playerId) roads += 1
  }
  for (const building of Object.values(board.vertexOccupancy)) {
    if (building?.ownerId !== playerId) continue
    if (building.type === 'SETTLEMENT') settlements += 1
    else cities += 1
  }

  return { roads, settlements, cities }
}
