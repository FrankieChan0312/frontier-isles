import type {
  BoardTopology,
  EdgeDefinition,
  PortDefinition,
} from '../model/board-state.ts'
import type { EdgeId, PortId } from '../model/ids.ts'
import { deriveOrderedCoastlineEdgeIds } from './coastline.ts'
import type { NinePortKinds } from './port-slots.ts'
import { createStandardBoardTopology } from './standard-board-topology.ts'
import { createPortId } from './topology-ids.ts'
import { assertStandardBoardTopology } from './topology-invariants.ts'

const PORT_KINDS: NinePortKinds = [
  { type: 'GENERIC' },
  { type: 'RESOURCE', resource: 'LUMBER' },
  { type: 'RESOURCE', resource: 'BRICK' },
  { type: 'RESOURCE', resource: 'WOOL' },
  { type: 'RESOURCE', resource: 'GRAIN' },
  { type: 'RESOURCE', resource: 'ORE' },
  { type: 'GENERIC' },
  { type: 'GENERIC' },
  { type: 'GENERIC' },
]

function requireValue<Value>(value: Value | undefined, label: string): Value {
  if (value === undefined) {
    throw new Error(`Missing test fixture value: ${label}.`)
  }
  return value
}

function replacePortEdge(
  topology: BoardTopology,
  portToReplace: PortDefinition,
  replacementEdge: EdgeDefinition,
): BoardTopology {
  const ports: Record<PortId, PortDefinition> = {}
  for (const port of Object.values(topology.ports)) {
    if (port.id !== portToReplace.id) {
      ports[port.id] = port
    }
  }

  const replacementPortId = createPortId(replacementEdge.id)
  ports[replacementPortId] = {
    id: replacementPortId,
    edgeId: replacementEdge.id,
    vertexIds: [replacementEdge.vertexIds[0], replacementEdge.vertexIds[1]],
    kind:
      portToReplace.kind.type === 'GENERIC'
        ? { type: 'GENERIC' }
        : { type: 'RESOURCE', resource: portToReplace.kind.resource },
  }

  return { ...topology, ports }
}

describe('standard board topology invariants', () => {
  it('accepts a generated topology without mutating it', () => {
    const topology = createStandardBoardTopology(PORT_KINDS)
    const before = JSON.stringify(topology)

    expect(() => assertStandardBoardTopology(topology)).not.toThrow()
    expect(JSON.stringify(topology)).toBe(before)
  })

  it('rejects a missing tile edge reference', () => {
    const topology = createStandardBoardTopology(PORT_KINDS)
    const tile = requireValue(topology.tiles['tile:-2,0' as keyof typeof topology.tiles], 'tile')
    const missingEdgeId = 'edge:missing-left|missing-right' as EdgeId
    const corrupted: BoardTopology = {
      ...topology,
      tiles: {
        ...topology.tiles,
        [tile.id]: {
          ...tile,
          edgeIds: [
            missingEdgeId,
            tile.edgeIds[1],
            tile.edgeIds[2],
            tile.edgeIds[3],
            tile.edgeIds[4],
            tile.edgeIds[5],
          ],
        },
      },
    }

    expect(() => assertStandardBoardTopology(corrupted)).toThrow(/unknown edge/)
  })

  it('rejects non-reciprocal vertex adjacency', () => {
    const topology = createStandardBoardTopology(PORT_KINDS)
    const vertex = requireValue(Object.values(topology.vertices)[0], 'vertex')
    const adjacentVertexId = requireValue(vertex.adjacentVertexIds[0], 'adjacent vertex')
    const corrupted: BoardTopology = {
      ...topology,
      vertices: {
        ...topology.vertices,
        [vertex.id]: {
          ...vertex,
          adjacentVertexIds: vertex.adjacentVertexIds.filter((id) => id !== adjacentVertexId),
        },
      },
    }

    expect(() => assertStandardBoardTopology(corrupted)).toThrow(/adjacency|edge-degree/)
  })

  it('rejects an edge with an incorrect coastal flag', () => {
    const topology = createStandardBoardTopology(PORT_KINDS)
    const edge = requireValue(
      Object.values(topology.edges).find((candidate) => candidate.coastal),
      'coastal edge',
    )
    const corrupted: BoardTopology = {
      ...topology,
      edges: {
        ...topology.edges,
        [edge.id]: { ...edge, coastal: false },
      },
    }

    expect(() => assertStandardBoardTopology(corrupted)).toThrow(/coastal flag/)
  })

  it('rejects a port attached to a non-coastal edge', () => {
    const topology = createStandardBoardTopology(PORT_KINDS)
    const port = requireValue(Object.values(topology.ports)[0], 'port')
    const interiorEdge = requireValue(
      Object.values(topology.edges).find((edge) => !edge.coastal),
      'interior edge',
    )
    const corrupted = replacePortEdge(topology, port, interiorEdge)

    expect(() => assertStandardBoardTopology(corrupted)).toThrow(/port|slot|coastal/)
  })

  it('rejects a port moved to an adjacent coastline slot', () => {
    const topology = createStandardBoardTopology(PORT_KINDS)
    const coastlineEdgeIds = deriveOrderedCoastlineEdgeIds(topology)
    const port = requireValue(Object.values(topology.ports).at(-1), 'last port')
    const adjacentEdgeId = requireValue(coastlineEdgeIds[1], 'adjacent coastline edge')
    const adjacentEdge = requireValue(topology.edges[adjacentEdgeId], 'adjacent edge')
    const corrupted = replacePortEdge(topology, port, adjacentEdge)

    expect(() => assertStandardBoardTopology(corrupted)).toThrow(/port|slot|adjacent/)
  })
})
