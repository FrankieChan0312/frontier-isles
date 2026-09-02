import type { HexCoordinate } from '../model/board-state.ts'
import type { EdgeId, PortId, TileId, VertexId } from '../model/ids.ts'
import type { IntegerCornerCoordinate } from './coordinates.ts'

export function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

export function createTileId(coordinate: HexCoordinate): TileId {
  return `tile:${coordinate.q},${coordinate.r}` as TileId
}

export function createVertexId(coordinate: IntegerCornerCoordinate): VertexId {
  if (coordinate.x + coordinate.y + coordinate.z !== 0) {
    throw new Error(
      `Cannot create VertexId from non-zero-sum corner ${coordinate.x},${coordinate.y},${coordinate.z}.`,
    )
  }

  return `vertex:${coordinate.x},${coordinate.y},${coordinate.z}` as VertexId
}

export function orderVertexIds(
  left: VertexId,
  right: VertexId,
): readonly [VertexId, VertexId] {
  if (left === right) {
    throw new Error(`Cannot create an edge with identical endpoint ${left}.`)
  }

  return compareCodeUnits(left, right) < 0 ? [left, right] : [right, left]
}

export function createEdgeId(left: VertexId, right: VertexId): EdgeId {
  const [lowerVertexId, higherVertexId] = orderVertexIds(left, right)
  return `edge:${lowerVertexId}|${higherVertexId}` as EdgeId
}

export function createPortId(edgeId: EdgeId): PortId {
  return `port:${edgeId}` as PortId
}

