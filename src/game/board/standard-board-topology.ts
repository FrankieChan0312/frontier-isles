import type {
  BoardTopology,
  EdgeDefinition,
  TileDefinition,
  VertexDefinition,
} from '../model/board-state.ts'
import type { EdgeId, TileId, VertexId } from '../model/ids.ts'
import {
  createIntegerCornerCoordinate,
  createStandardAxialCoordinates,
  ORDERED_CORNER_INDICES,
} from './coordinates.ts'
import { createStandardPorts, type NinePortKinds } from './port-slots.ts'
import {
  compareCodeUnits,
  createEdgeId,
  createTileId,
  createVertexId,
  orderVertexIds,
} from './topology-ids.ts'
import { assertStandardBoardTopology } from './topology-invariants.ts'

interface MutableVertexDefinition {
  readonly id: VertexId
  readonly adjacentVertexIds: Set<VertexId>
  readonly edgeIds: Set<EdgeId>
  readonly tileIds: Set<TileId>
}

interface MutableEdgeDefinition {
  readonly id: EdgeId
  readonly vertexIds: readonly [VertexId, VertexId]
  readonly tileIds: Set<TileId>
}

function asVertexTuple(vertexIds: readonly VertexId[]): TileDefinition['vertexIds'] {
  if (vertexIds.length !== 6) {
    throw new Error(`A standard tile requires six vertices; received ${vertexIds.length}.`)
  }

  const [first, second, third, fourth, fifth, sixth] = vertexIds
  if (
    first === undefined ||
    second === undefined ||
    third === undefined ||
    fourth === undefined ||
    fifth === undefined ||
    sixth === undefined
  ) {
    throw new Error('A standard tile is missing a vertex.')
  }

  return [first, second, third, fourth, fifth, sixth]
}

function asEdgeTuple(edgeIds: readonly EdgeId[]): TileDefinition['edgeIds'] {
  if (edgeIds.length !== 6) {
    throw new Error(`A standard tile requires six edges; received ${edgeIds.length}.`)
  }

  const [first, second, third, fourth, fifth, sixth] = edgeIds
  if (
    first === undefined ||
    second === undefined ||
    third === undefined ||
    fourth === undefined ||
    fifth === undefined ||
    sixth === undefined
  ) {
    throw new Error('A standard tile is missing an edge.')
  }

  return [first, second, third, fourth, fifth, sixth]
}

function getOrCreateVertex(
  vertices: Map<VertexId, MutableVertexDefinition>,
  vertexId: VertexId,
): MutableVertexDefinition {
  const existing = vertices.get(vertexId)
  if (existing !== undefined) {
    return existing
  }

  const created: MutableVertexDefinition = {
    id: vertexId,
    adjacentVertexIds: new Set(),
    edgeIds: new Set(),
    tileIds: new Set(),
  }
  vertices.set(vertexId, created)
  return created
}

function getOrCreateEdge(
  edges: Map<EdgeId, MutableEdgeDefinition>,
  leftVertexId: VertexId,
  rightVertexId: VertexId,
): MutableEdgeDefinition {
  const edgeId = createEdgeId(leftVertexId, rightVertexId)
  const existing = edges.get(edgeId)
  if (existing !== undefined) {
    return existing
  }

  const created: MutableEdgeDefinition = {
    id: edgeId,
    vertexIds: orderVertexIds(leftVertexId, rightVertexId),
    tileIds: new Set(),
  }
  edges.set(edgeId, created)
  return created
}

function buildLandTopology(): BoardTopology {
  const tiles: Record<TileId, TileDefinition> = {}
  const mutableVertices = new Map<VertexId, MutableVertexDefinition>()
  const mutableEdges = new Map<EdgeId, MutableEdgeDefinition>()

  for (const coordinate of createStandardAxialCoordinates()) {
    const tileId = createTileId(coordinate)
    const vertexIds = asVertexTuple(
      ORDERED_CORNER_INDICES.map((cornerIndex) =>
        createVertexId(createIntegerCornerCoordinate(coordinate, cornerIndex)),
      ),
    )
    const edgeIds = asEdgeTuple(
      ORDERED_CORNER_INDICES.map((cornerIndex) => {
        const leftVertexId = vertexIds[cornerIndex]
        const rightVertexId = vertexIds[(cornerIndex + 1) % 6]
        if (leftVertexId === undefined || rightVertexId === undefined) {
          throw new Error(`Tile ${tileId} has an incomplete cyclic vertex tuple.`)
        }
        return createEdgeId(leftVertexId, rightVertexId)
      }),
    )

    tiles[tileId] = {
      id: tileId,
      coordinate: { q: coordinate.q, r: coordinate.r },
      vertexIds,
      edgeIds,
    }

    for (const vertexId of vertexIds) {
      getOrCreateVertex(mutableVertices, vertexId).tileIds.add(tileId)
    }

    for (const cornerIndex of ORDERED_CORNER_INDICES) {
      const leftVertexId = vertexIds[cornerIndex]
      const rightVertexId = vertexIds[(cornerIndex + 1) % 6]
      if (leftVertexId === undefined || rightVertexId === undefined) {
        throw new Error(`Tile ${tileId} has an incomplete edge definition.`)
      }

      const edge = getOrCreateEdge(mutableEdges, leftVertexId, rightVertexId)
      edge.tileIds.add(tileId)

      const leftVertex = getOrCreateVertex(mutableVertices, leftVertexId)
      const rightVertex = getOrCreateVertex(mutableVertices, rightVertexId)
      leftVertex.adjacentVertexIds.add(rightVertexId)
      rightVertex.adjacentVertexIds.add(leftVertexId)
      leftVertex.edgeIds.add(edge.id)
      rightVertex.edgeIds.add(edge.id)
    }
  }

  const vertices: Record<VertexId, VertexDefinition> = {}
  for (const [vertexId, vertex] of [...mutableVertices].sort(([left], [right]) =>
    compareCodeUnits(left, right),
  )) {
    vertices[vertexId] = {
      id: vertex.id,
      adjacentVertexIds: [...vertex.adjacentVertexIds].sort(compareCodeUnits),
      edgeIds: [...vertex.edgeIds].sort(compareCodeUnits),
      tileIds: [...vertex.tileIds].sort(compareCodeUnits),
    }
  }

  const edges: Record<EdgeId, EdgeDefinition> = {}
  for (const [edgeId, edge] of [...mutableEdges].sort(([left], [right]) =>
    compareCodeUnits(left, right),
  )) {
    const tileIds = [...edge.tileIds].sort(compareCodeUnits)
    edges[edgeId] = {
      id: edge.id,
      vertexIds: [edge.vertexIds[0], edge.vertexIds[1]],
      tileIds,
      coastal: tileIds.length === 1,
    }
  }

  return { tiles, vertices, edges, ports: {} }
}

export function createStandardBoardTopology(portKinds: NinePortKinds): BoardTopology {
  if (portKinds.length !== 9) {
    throw new Error(`Standard board requires exactly nine port kinds; received ${portKinds.length}.`)
  }

  const landTopology = buildLandTopology()
  const topology: BoardTopology = {
    tiles: landTopology.tiles,
    vertices: landTopology.vertices,
    edges: landTopology.edges,
    ports: createStandardPorts(landTopology, portKinds),
  }

  assertStandardBoardTopology(topology)
  return topology
}
