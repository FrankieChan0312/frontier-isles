import type { BoardTopology } from '../model/board-state.ts'
import type { EdgeId, VertexId } from '../model/ids.ts'
import { compareCodeUnits, createEdgeId } from './topology-ids.ts'

function addCoastalNeighbour(
  neighboursByVertex: Map<VertexId, Set<VertexId>>,
  vertexId: VertexId,
  neighbourId: VertexId,
): void {
  const neighbours = neighboursByVertex.get(vertexId)

  if (neighbours === undefined) {
    neighboursByVertex.set(vertexId, new Set([neighbourId]))
    return
  }

  neighbours.add(neighbourId)
}

export function deriveOrderedCoastlineEdgeIds(topology: BoardTopology): readonly EdgeId[] {
  const coastalEdges = Object.values(topology.edges).filter((edge) => edge.coastal)

  if (coastalEdges.length === 0) {
    throw new Error('Cannot derive coastline from a topology without coastal edges.')
  }

  const neighboursByVertex = new Map<VertexId, Set<VertexId>>()

  for (const edge of coastalEdges) {
    const [left, right] = edge.vertexIds
    addCoastalNeighbour(neighboursByVertex, left, right)
    addCoastalNeighbour(neighboursByVertex, right, left)
  }

  for (const [vertexId, neighbours] of neighboursByVertex) {
    if (neighbours.size !== 2) {
      throw new Error(
        `Coastal vertex ${vertexId} must have exactly two coastal neighbours; found ${neighbours.size}.`,
      )
    }
  }

  const coastalVertexIds = [...neighboursByVertex.keys()].sort(compareCodeUnits)
  const startVertexId = coastalVertexIds[0]

  if (startVertexId === undefined) {
    throw new Error('Cannot select a coastline start vertex.')
  }

  const startNeighbours = [...(neighboursByVertex.get(startVertexId) ?? [])].sort(compareCodeUnits)
  const firstNeighbourId = startNeighbours[0]

  if (firstNeighbourId === undefined) {
    throw new Error(`Coastline start vertex ${startVertexId} has no neighbour.`)
  }

  const visitedEdgeIds = new Set<EdgeId>()
  const orderedEdgeIds: EdgeId[] = []
  let previousVertexId = startVertexId
  let currentVertexId = firstNeighbourId

  while (true) {
    const edgeId = createEdgeId(previousVertexId, currentVertexId)
    const edge = topology.edges[edgeId]

    if (edge === undefined || !edge.coastal) {
      throw new Error(`Coastline traversal reached missing or non-coastal edge ${edgeId}.`)
    }

    if (visitedEdgeIds.has(edgeId)) {
      throw new Error(`Coastline traversal reused edge ${edgeId}.`)
    }

    visitedEdgeIds.add(edgeId)
    orderedEdgeIds.push(edgeId)

    if (currentVertexId === startVertexId) {
      break
    }

    const currentNeighbours = [...(neighboursByVertex.get(currentVertexId) ?? [])].sort(
      compareCodeUnits,
    )

    if (currentNeighbours.length !== 2) {
      throw new Error(`Coastline traversal cannot continue from vertex ${currentVertexId}.`)
    }

    const nextVertexId =
      currentNeighbours[0] === previousVertexId ? currentNeighbours[1] : currentNeighbours[0]

    if (nextVertexId === undefined || nextVertexId === previousVertexId) {
      throw new Error(`Coastline traversal found no forward neighbour at ${currentVertexId}.`)
    }

    previousVertexId = currentVertexId
    currentVertexId = nextVertexId

    if (orderedEdgeIds.length > coastalEdges.length) {
      throw new Error('Coastline traversal exceeded the number of coastal edges.')
    }
  }

  if (orderedEdgeIds.length !== coastalEdges.length) {
    throw new Error(
      `Coastline traversal visited ${orderedEdgeIds.length} of ${coastalEdges.length} coastal edges.`,
    )
  }

  return orderedEdgeIds
}

