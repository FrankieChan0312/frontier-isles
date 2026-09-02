import type { GameState } from '../model/game-state.ts'
import type { PlayerId, TileId } from '../model/ids.ts'
import { RESOURCE_TYPES } from '../model/resource.ts'

function assertTargetInvariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid robber target state: ${message}`)
}

function resourceCardCount(state: GameState, playerId: PlayerId): number {
  const player = state.players[playerId]
  assertTargetInvariant(player !== undefined, `unknown player ${playerId}.`)
  let total = 0
  for (const resource of RESOURCE_TYPES) {
    const count = player.resources[resource]
    assertTargetInvariant(
      Number.isSafeInteger(count) && count >= 0,
      `player ${playerId} ${resource} must be a non-negative safe integer.`,
    )
    total += count
    assertTargetInvariant(Number.isSafeInteger(total), `player ${playerId} resource total is unsafe.`)
  }
  return total
}

export function deriveEligibleRobberTargetPlayerIds(
  state: GameState,
  tileId: TileId,
  actingPlayerId: PlayerId,
): readonly PlayerId[] {
  const tile = state.board.topology.tiles[tileId]
  assertTargetInvariant(tile !== undefined, `tile ${tileId} is absent from topology.`)
  assertTargetInvariant(state.players[actingPlayerId] !== undefined, `acting player ${actingPlayerId} is unknown.`)

  const adjacentOwners = new Set<PlayerId>()
  for (const vertexId of tile.vertexIds) {
    const building = state.board.vertexOccupancy[vertexId]
    if (building === null || building === undefined) continue
    assertTargetInvariant(
      building.type === 'SETTLEMENT' || building.type === 'CITY',
      `vertex ${vertexId} has an invalid building kind.`,
    )
    assertTargetInvariant(
      state.players[building.ownerId] !== undefined,
      `vertex ${vertexId} has unknown owner ${building.ownerId}.`,
    )
    adjacentOwners.add(building.ownerId)
  }

  return state.playerOrder.filter((playerId) =>
    playerId !== actingPlayerId
    && adjacentOwners.has(playerId)
    && resourceCardCount(state, playerId) > 0,
  )
}
