import type { BoardState } from '../model/board-state.ts'
import type { EdgeId, PlayerId, VertexId } from '../model/ids.ts'

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function isBlockedVertex(board: BoardState, vertexId: VertexId, playerId: PlayerId): boolean {
  const building = board.vertexOccupancy[vertexId]
  return building !== null && building !== undefined && building.ownerId !== playerId
}

function trailLengthFrom(
  board: BoardState,
  playerId: PlayerId,
  currentVertexId: VertexId,
  usedEdgeIds: ReadonlySet<EdgeId>,
): number {
  if (isBlockedVertex(board, currentVertexId, playerId)) return 0

  const vertex = board.topology.vertices[currentVertexId]
  if (vertex === undefined) return 0
  let longestContinuation = 0
  const incidentEdgeIds = [...vertex.edgeIds].sort(compareCodeUnits)
  for (const edgeId of incidentEdgeIds) {
    if (usedEdgeIds.has(edgeId) || board.edgeOccupancy[edgeId]?.ownerId !== playerId) continue
    const edge = board.topology.edges[edgeId]
    if (edge === undefined) continue
    const nextVertexId = edge.vertexIds[0] === currentVertexId
      ? edge.vertexIds[1]
      : edge.vertexIds[0]
    const nextUsedEdgeIds = new Set(usedEdgeIds)
    nextUsedEdgeIds.add(edgeId)
    longestContinuation = Math.max(
      longestContinuation,
      1 + trailLengthFrom(board, playerId, nextVertexId, nextUsedEdgeIds),
    )
  }
  return longestContinuation
}

export function deriveLongestRoadLength(board: BoardState, playerId: PlayerId): number {
  const ownedEdgeIds = (Object.keys(board.edgeOccupancy) as EdgeId[])
    .filter((edgeId) => board.edgeOccupancy[edgeId]?.ownerId === playerId)
    .sort(compareCodeUnits)
  let longest = 0
  for (const edgeId of ownedEdgeIds) {
    const edge = board.topology.edges[edgeId]
    if (edge === undefined) continue
    const usedEdgeIds = new Set<EdgeId>([edgeId])
    for (const destinationVertexId of edge.vertexIds) {
      longest = Math.max(
        longest,
        1 + trailLengthFrom(board, playerId, destinationVertexId, usedEdgeIds),
      )
    }
  }
  return longest
}
