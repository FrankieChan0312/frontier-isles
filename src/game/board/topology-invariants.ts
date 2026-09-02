import type { BoardTopology, PortKind } from '../model/board-state.ts'
import type { EdgeId, PortId, TileId, VertexId } from '../model/ids.ts'
import { RESOURCE_TYPES } from '../model/resource.ts'
import { deriveOrderedCoastlineEdgeIds } from './coastline.ts'
import {
  createIntegerCornerCoordinate,
  createStandardAxialCoordinates,
  ORDERED_CORNER_INDICES,
} from './coordinates.ts'
import { STANDARD_PORT_SLOT_EDGE_INDICES } from './port-slots.ts'
import {
  compareCodeUnits,
  createEdgeId,
  createPortId,
  createTileId,
  createVertexId,
  orderVertexIds,
} from './topology-ids.ts'

function assertInvariant(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Invalid standard board topology: ${message}`)
  }
}

function assertSortedUnique(ids: readonly string[], label: string): void {
  for (let index = 1; index < ids.length; index += 1) {
    const previous = ids[index - 1]
    const current = ids[index]
    assertInvariant(previous !== undefined && current !== undefined, `${label} contains a gap.`)
    assertInvariant(
      compareCodeUnits(previous, current) < 0,
      `${label} must be duplicate-free and code-unit sorted.`,
    )
  }
}

function assertKnownTile(topology: BoardTopology, tileId: TileId, context: string): void {
  assertInvariant(topology.tiles[tileId] !== undefined, `${context} references unknown tile ${tileId}.`)
}

function assertKnownVertex(topology: BoardTopology, vertexId: VertexId, context: string): void {
  assertInvariant(
    topology.vertices[vertexId] !== undefined,
    `${context} references unknown vertex ${vertexId}.`,
  )
}

function assertKnownEdge(topology: BoardTopology, edgeId: EdgeId, context: string): void {
  assertInvariant(topology.edges[edgeId] !== undefined, `${context} references unknown edge ${edgeId}.`)
}

function assertValidPortKind(kind: PortKind, portId: PortId): void {
  if (kind.type === 'GENERIC') {
    return
  }

  assertInvariant(
    RESOURCE_TYPES.includes(kind.resource),
    `port ${portId} has invalid resource kind ${kind.resource}.`,
  )
}

function assertTileDefinitions(topology: BoardTopology): void {
  const expectedCoordinates = createStandardAxialCoordinates()
  assertInvariant(expectedCoordinates.length === 19, 'radius-two coordinate generation must yield 19 tiles.')

  for (const coordinate of expectedCoordinates) {
    const expectedTileId = createTileId(coordinate)
    const tile = topology.tiles[expectedTileId]
    assertInvariant(tile !== undefined, `missing expected tile ${expectedTileId}.`)
    assertInvariant(tile.id === expectedTileId, `tile ${expectedTileId} stores a mismatched ID.`)
    assertInvariant(
      tile.coordinate.q === coordinate.q && tile.coordinate.r === coordinate.r,
      `tile ${expectedTileId} stores an incorrect coordinate.`,
    )
    assertInvariant(tile.vertexIds.length === 6, `tile ${expectedTileId} must have six vertices.`)
    assertInvariant(tile.edgeIds.length === 6, `tile ${expectedTileId} must have six edges.`)
    assertInvariant(
      new Set(tile.vertexIds).size === 6,
      `tile ${expectedTileId} contains duplicate vertices.`,
    )
    assertInvariant(new Set(tile.edgeIds).size === 6, `tile ${expectedTileId} contains duplicate edges.`)

    for (const cornerIndex of ORDERED_CORNER_INDICES) {
      const vertexId = tile.vertexIds[cornerIndex]
      const nextVertexId = tile.vertexIds[(cornerIndex + 1) % 6]
      const edgeId = tile.edgeIds[cornerIndex]
      assertInvariant(
        vertexId !== undefined && nextVertexId !== undefined && edgeId !== undefined,
        `tile ${expectedTileId} has an incomplete cyclic tuple.`,
      )

      const expectedVertexId = createVertexId(
        createIntegerCornerCoordinate(coordinate, cornerIndex),
      )
      assertInvariant(
        vertexId === expectedVertexId,
        `tile ${expectedTileId} corner ${cornerIndex} has unstable vertex ID ${vertexId}.`,
      )
      assertKnownVertex(topology, vertexId, `tile ${expectedTileId}`)
      assertKnownEdge(topology, edgeId, `tile ${expectedTileId}`)
      assertInvariant(
        edgeId === createEdgeId(vertexId, nextVertexId),
        `tile ${expectedTileId} edge ${cornerIndex} does not connect its cyclic vertices.`,
      )
      assertInvariant(
        topology.vertices[vertexId]?.tileIds.includes(expectedTileId) === true,
        `vertex ${vertexId} is not reciprocal with tile ${expectedTileId}.`,
      )
      assertInvariant(
        topology.edges[edgeId]?.tileIds.includes(expectedTileId) === true,
        `edge ${edgeId} is not reciprocal with tile ${expectedTileId}.`,
      )
    }
  }
}

function assertVertexDefinitions(topology: BoardTopology): void {
  const incidentEdgeDistribution: Record<number, number> = {}
  const adjacentTileDistribution: Record<number, number> = {}

  for (const [recordKey, vertex] of Object.entries(topology.vertices)) {
    assertInvariant(recordKey === vertex.id, `vertex record key ${recordKey} does not match its ID.`)
    assertSortedUnique(vertex.adjacentVertexIds, `vertex ${vertex.id} adjacentVertexIds`)
    assertSortedUnique(vertex.edgeIds, `vertex ${vertex.id} edgeIds`)
    assertSortedUnique(vertex.tileIds, `vertex ${vertex.id} tileIds`)

    incidentEdgeDistribution[vertex.edgeIds.length] =
      (incidentEdgeDistribution[vertex.edgeIds.length] ?? 0) + 1
    adjacentTileDistribution[vertex.tileIds.length] =
      (adjacentTileDistribution[vertex.tileIds.length] ?? 0) + 1

    for (const adjacentVertexId of vertex.adjacentVertexIds) {
      assertKnownVertex(topology, adjacentVertexId, `vertex ${vertex.id}`)
      assertInvariant(
        topology.vertices[adjacentVertexId]?.adjacentVertexIds.includes(vertex.id) === true,
        `adjacency ${vertex.id} -> ${adjacentVertexId} is not reciprocal.`,
      )
      const connectingEdgeId = createEdgeId(vertex.id, adjacentVertexId)
      assertInvariant(
        vertex.edgeIds.includes(connectingEdgeId),
        `vertex ${vertex.id} adjacency to ${adjacentVertexId} lacks edge ${connectingEdgeId}.`,
      )
    }

    for (const edgeId of vertex.edgeIds) {
      assertKnownEdge(topology, edgeId, `vertex ${vertex.id}`)
      assertInvariant(
        topology.edges[edgeId]?.vertexIds.includes(vertex.id) === true,
        `edge ${edgeId} is not reciprocal with vertex ${vertex.id}.`,
      )
    }

    for (const tileId of vertex.tileIds) {
      assertKnownTile(topology, tileId, `vertex ${vertex.id}`)
      assertInvariant(
        topology.tiles[tileId]?.vertexIds.includes(vertex.id) === true,
        `tile ${tileId} is not reciprocal with vertex ${vertex.id}.`,
      )
    }
  }

  assertInvariant(
    incidentEdgeDistribution[3] === 36 && incidentEdgeDistribution[2] === 18,
    `vertex edge-degree distribution must be 36x3 and 18x2; found ${JSON.stringify(incidentEdgeDistribution)}.`,
  )
  assertInvariant(
    Object.keys(incidentEdgeDistribution).every((degree) => degree === '2' || degree === '3'),
    'vertices may have only two or three incident edges.',
  )
  assertInvariant(
    adjacentTileDistribution[3] === 24 &&
      adjacentTileDistribution[2] === 12 &&
      adjacentTileDistribution[1] === 18,
    `vertex tile-incidence distribution must be 24x3, 12x2, and 18x1; found ${JSON.stringify(adjacentTileDistribution)}.`,
  )
  assertInvariant(
    Object.keys(adjacentTileDistribution).every(
      (incidence) => incidence === '1' || incidence === '2' || incidence === '3',
    ),
    'vertices may be adjacent to only one, two, or three tiles.',
  )
}

function assertEdgeDefinitions(topology: BoardTopology): void {
  let interiorEdgeCount = 0
  let coastalEdgeCount = 0

  for (const [recordKey, edge] of Object.entries(topology.edges)) {
    assertInvariant(recordKey === edge.id, `edge record key ${recordKey} does not match its ID.`)
    const [leftVertexId, rightVertexId] = edge.vertexIds
    assertInvariant(leftVertexId !== rightVertexId, `edge ${edge.id} has identical endpoints.`)
    const expectedVertexIds = orderVertexIds(leftVertexId, rightVertexId)
    assertInvariant(
      edge.vertexIds[0] === expectedVertexIds[0] && edge.vertexIds[1] === expectedVertexIds[1],
      `edge ${edge.id} endpoints are not in canonical order.`,
    )
    assertInvariant(
      edge.id === createEdgeId(leftVertexId, rightVertexId),
      `edge ${edge.id} does not use the stable edge ID format.`,
    )
    assertKnownVertex(topology, leftVertexId, `edge ${edge.id}`)
    assertKnownVertex(topology, rightVertexId, `edge ${edge.id}`)
    assertSortedUnique(edge.tileIds, `edge ${edge.id} tileIds`)
    assertInvariant(
      edge.tileIds.length === 1 || edge.tileIds.length === 2,
      `edge ${edge.id} must touch one or two tiles; found ${edge.tileIds.length}.`,
    )
    assertInvariant(
      edge.coastal === (edge.tileIds.length === 1),
      `edge ${edge.id} coastal flag disagrees with tile incidence.`,
    )

    if (edge.coastal) {
      coastalEdgeCount += 1
    } else {
      interiorEdgeCount += 1
    }

    for (const vertexId of edge.vertexIds) {
      assertInvariant(
        topology.vertices[vertexId]?.edgeIds.includes(edge.id) === true,
        `vertex ${vertexId} is not reciprocal with edge ${edge.id}.`,
      )
    }
    for (const tileId of edge.tileIds) {
      assertKnownTile(topology, tileId, `edge ${edge.id}`)
      assertInvariant(
        topology.tiles[tileId]?.edgeIds.includes(edge.id) === true,
        `tile ${tileId} is not reciprocal with edge ${edge.id}.`,
      )
    }
  }

  assertInvariant(interiorEdgeCount === 42, `expected 42 interior edges; found ${interiorEdgeCount}.`)
  assertInvariant(coastalEdgeCount === 30, `expected 30 coastal edges; found ${coastalEdgeCount}.`)
}

function assertCoastline(topology: BoardTopology): readonly EdgeId[] {
  const coastlineEdgeIds = deriveOrderedCoastlineEdgeIds(topology)
  assertInvariant(coastlineEdgeIds.length === 30, `coastline must contain 30 edges.`)
  assertInvariant(new Set(coastlineEdgeIds).size === 30, 'coastline contains a duplicate edge.')

  const coastalVertexIds = new Set<VertexId>()
  for (const edgeId of coastlineEdgeIds) {
    const edge = topology.edges[edgeId]
    assertInvariant(edge !== undefined && edge.coastal, `coastline contains invalid edge ${edgeId}.`)
    coastalVertexIds.add(edge.vertexIds[0])
    coastalVertexIds.add(edge.vertexIds[1])
  }
  assertInvariant(coastalVertexIds.size === 30, `coastline must contain 30 distinct vertices.`)

  return coastlineEdgeIds
}

function assertPorts(topology: BoardTopology, coastlineEdgeIds: readonly EdgeId[]): void {
  const ports = Object.values(topology.ports)
  assertInvariant(ports.length === 9, `expected 9 ports; found ${ports.length}.`)

  const expectedEdgeIds = STANDARD_PORT_SLOT_EDGE_INDICES.map((index) => coastlineEdgeIds[index])
  assertInvariant(
    expectedEdgeIds.every((edgeId) => edgeId !== undefined),
    'one or more frozen port slots cannot be resolved.',
  )

  const occupiedVertexIds = new Set<VertexId>()
  for (const expectedEdgeId of expectedEdgeIds) {
    assertInvariant(expectedEdgeId !== undefined, 'frozen port slot resolved to no edge.')
    const expectedPortId = createPortId(expectedEdgeId)
    const port = topology.ports[expectedPortId]
    const edge = topology.edges[expectedEdgeId]
    assertInvariant(port !== undefined, `missing port ${expectedPortId} for frozen slot.`)
    assertInvariant(edge !== undefined && edge.coastal, `port ${expectedPortId} edge is not coastal.`)
    assertInvariant(port.id === expectedPortId, `port ${expectedPortId} stores a mismatched ID.`)
    assertInvariant(port.edgeId === expectedEdgeId, `port ${expectedPortId} stores a mismatched edge.`)
    assertInvariant(
      port.vertexIds[0] === edge.vertexIds[0] && port.vertexIds[1] === edge.vertexIds[1],
      `port ${expectedPortId} does not copy its edge endpoints.`,
    )
    assertValidPortKind(port.kind, expectedPortId)

    for (const vertexId of port.vertexIds) {
      assertInvariant(
        !occupiedVertexIds.has(vertexId),
        `port ${expectedPortId} is adjacent to another port at vertex ${vertexId}.`,
      )
      occupiedVertexIds.add(vertexId)
    }
  }

  for (const [recordKey, port] of Object.entries(topology.ports)) {
    assertInvariant(recordKey === port.id, `port record key ${recordKey} does not match its ID.`)
    assertInvariant(
      port.id === createPortId(port.edgeId),
      `port ${port.id} does not use the stable port ID format.`,
    )
    assertInvariant(
      expectedEdgeIds.includes(port.edgeId),
      `port ${port.id} is not attached to a frozen standard slot.`,
    )
  }
}

export function assertStandardBoardTopology(topology: BoardTopology): void {
  assertInvariant(Object.keys(topology.tiles).length === 19, 'expected exactly 19 tiles.')
  assertInvariant(Object.keys(topology.vertices).length === 54, 'expected exactly 54 vertices.')
  assertInvariant(Object.keys(topology.edges).length === 72, 'expected exactly 72 edges.')

  assertTileDefinitions(topology)
  assertVertexDefinitions(topology)
  assertEdgeDefinitions(topology)
  const coastlineEdgeIds = assertCoastline(topology)
  assertPorts(topology, coastlineEdgeIds)
}
