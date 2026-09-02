import type { EdgeId, TileId, VertexId } from '../model/ids.ts'
import { deriveOrderedCoastlineEdgeIds } from './coastline.ts'
import {
  axialToCubeCoordinate,
  createIntegerCornerCoordinate,
  createStandardAxialCoordinates,
  ORDERED_CORNER_INDICES,
} from './coordinates.ts'
import {
  type NinePortKinds,
  STANDARD_PORT_SLOT_EDGE_INDICES,
} from './port-slots.ts'
import { createStandardBoardTopology } from './standard-board-topology.ts'
import {
  createEdgeId,
  createPortId,
  createTileId,
  createVertexId,
} from './topology-ids.ts'

const EXPECTED_COORDINATES = [
  { q: -2, r: 0 },
  { q: -2, r: 1 },
  { q: -2, r: 2 },
  { q: -1, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: -1, r: 2 },
  { q: 0, r: -2 },
  { q: 0, r: -1 },
  { q: 0, r: 0 },
  { q: 0, r: 1 },
  { q: 0, r: 2 },
  { q: 1, r: -2 },
  { q: 1, r: -1 },
  { q: 1, r: 0 },
  { q: 1, r: 1 },
  { q: 2, r: -2 },
  { q: 2, r: -1 },
  { q: 2, r: 0 },
] as const

const EXPECTED_PORT_EDGE_IDS = [
  'edge:vertex:-1,-7,8|vertex:-2,-5,7',
  'edge:vertex:-5,-2,7|vertex:-7,-1,8',
  'edge:vertex:-7,2,5|vertex:-8,4,4',
  'edge:vertex:-5,7,-2|vertex:-7,8,-1',
  'edge:vertex:-1,8,-7|vertex:-2,7,-5',
  'edge:vertex:2,5,-7|vertex:4,4,-8',
  'edge:vertex:7,-2,-5|vertex:8,-1,-7',
  'edge:vertex:7,-5,-2|vertex:8,-7,-1',
  'edge:vertex:4,-8,4|vertex:5,-7,2',
] as const satisfies readonly string[]

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

function countByLength(values: readonly (readonly unknown[])[]): Readonly<Record<number, number>> {
  const counts: Record<number, number> = {}
  for (const value of values) {
    counts[value.length] = (counts[value.length] ?? 0) + 1
  }
  return counts
}

function assertPlainJsonData(value: unknown): void {
  expect(typeof value).not.toBe('function')
  expect(value).not.toBeInstanceOf(Map)
  expect(value).not.toBeInstanceOf(Set)
  expect(value).not.toBeInstanceOf(Date)

  if (Array.isArray(value)) {
    for (const item of value) {
      assertPlainJsonData(item)
    }
    return
  }

  if (typeof value === 'object' && value !== null) {
    for (const item of Object.values(value as Readonly<Record<string, unknown>>)) {
      assertPlainJsonData(item)
    }
  }
}

describe('standard board topology', () => {
  it('generates the exact frozen radius-two coordinate order', () => {
    const coordinates = createStandardAxialCoordinates()

    expect(coordinates).toEqual(EXPECTED_COORDINATES)
    expect(new Set(coordinates.map(({ q, r }) => `${q},${r}`)).size).toBe(19)
  })

  it('uses zero-sum cube centers and integer scaled-cube corners', () => {
    for (const coordinate of createStandardAxialCoordinates()) {
      const cube = axialToCubeCoordinate(coordinate)
      expect(cube.x + cube.y + cube.z).toBe(0)

      for (const cornerIndex of ORDERED_CORNER_INDICES) {
        const corner = createIntegerCornerCoordinate(coordinate, cornerIndex)
        expect(corner.x + corner.y + corner.z).toBe(0)
        expect(Number.isInteger(corner.x)).toBe(true)
        expect(Number.isInteger(corner.y)).toBe(true)
        expect(Number.isInteger(corner.z)).toBe(true)
      }
    }
  })

  it('creates exact stable identifier formats with canonical edge endpoints', () => {
    const startVertexId = createVertexId({ x: -1, y: -7, z: 8 })
    const nextVertexId = createVertexId({ x: -2, y: -5, z: 7 })
    const edgeId = createEdgeId(startVertexId, nextVertexId)

    expect(createTileId({ q: -2, r: 0 })).toBe('tile:-2,0')
    expect(startVertexId).toBe('vertex:-1,-7,8')
    expect(edgeId).toBe('edge:vertex:-1,-7,8|vertex:-2,-5,7')
    expect(createEdgeId(nextVertexId, startVertexId)).toBe(edgeId)
    expect(createPortId(edgeId)).toBe(`port:${edgeId}`)
    expect(() => createEdgeId(startVertexId, startVertexId)).toThrow(/identical endpoint/)
    expect(() => createVertexId({ x: 1, y: 1, z: 1 })).toThrow(/non-zero-sum/)
  })

  it('deduplicates a shared physical corner and edge reached from neighbouring tiles', () => {
    const centerCorner0 = createVertexId(createIntegerCornerCoordinate({ q: 0, r: 0 }, 0))
    const centerCorner5 = createVertexId(createIntegerCornerCoordinate({ q: 0, r: 0 }, 5))
    const neighbourCorner2 = createVertexId(createIntegerCornerCoordinate({ q: 1, r: 0 }, 2))
    const neighbourCorner3 = createVertexId(createIntegerCornerCoordinate({ q: 1, r: 0 }, 3))

    expect(neighbourCorner2).toBe(centerCorner0)
    expect(neighbourCorner3).toBe(centerCorner5)
    expect(createEdgeId(centerCorner5, centerCorner0)).toBe(
      createEdgeId(neighbourCorner2, neighbourCorner3),
    )
  })

  it('creates the exact graph counts and incidence distributions', () => {
    const topology = createStandardBoardTopology(PORT_KINDS)
    const edges = Object.values(topology.edges)
    const vertices = Object.values(topology.vertices)

    expect(Object.keys(topology.tiles)).toHaveLength(19)
    expect(vertices).toHaveLength(54)
    expect(edges).toHaveLength(72)
    expect(Object.keys(topology.ports)).toHaveLength(9)
    expect(edges.filter((edge) => edge.coastal)).toHaveLength(30)
    expect(edges.filter((edge) => !edge.coastal)).toHaveLength(42)
    expect(countByLength(vertices.map((vertex) => vertex.edgeIds))).toEqual({ 2: 18, 3: 36 })
    expect(countByLength(vertices.map((vertex) => vertex.tileIds))).toEqual({
      1: 18,
      2: 12,
      3: 24,
    })
  })

  it('keeps cyclic tile tuples and all graph relationships reciprocal', () => {
    const topology = createStandardBoardTopology(PORT_KINDS)

    for (const tile of Object.values(topology.tiles)) {
      expect(new Set(tile.vertexIds).size).toBe(6)
      expect(new Set(tile.edgeIds).size).toBe(6)
      for (const cornerIndex of ORDERED_CORNER_INDICES) {
        const vertexId = tile.vertexIds[cornerIndex]
        const nextVertexId = tile.vertexIds[(cornerIndex + 1) % 6]
        const edgeId = tile.edgeIds[cornerIndex]
        if (nextVertexId === undefined) {
          throw new Error(`Tile ${tile.id} is missing its next cyclic vertex.`)
        }
        expect(edgeId).toBe(createEdgeId(vertexId, nextVertexId))
        expect(topology.vertices[vertexId]?.tileIds).toContain(tile.id)
        expect(topology.edges[edgeId]?.tileIds).toContain(tile.id)
      }
    }

    for (const vertex of Object.values(topology.vertices)) {
      expect(new Set(vertex.adjacentVertexIds).size).toBe(vertex.adjacentVertexIds.length)
      expect(new Set(vertex.edgeIds).size).toBe(vertex.edgeIds.length)
      expect(new Set(vertex.tileIds).size).toBe(vertex.tileIds.length)
      for (const adjacentVertexId of vertex.adjacentVertexIds) {
        expect(topology.vertices[adjacentVertexId]?.adjacentVertexIds).toContain(vertex.id)
      }
      for (const edgeId of vertex.edgeIds) {
        expect(topology.edges[edgeId]?.vertexIds).toContain(vertex.id)
      }
    }

    for (const edge of Object.values(topology.edges)) {
      expect(edge.coastal).toBe(edge.tileIds.length === 1)
      for (const tileId of edge.tileIds) {
        expect(topology.tiles[tileId]?.edgeIds).toContain(edge.id)
      }
    }
  })

  it('derives the frozen deterministic coastline cycle', () => {
    const topology = createStandardBoardTopology(PORT_KINDS)
    const coastlineEdgeIds = deriveOrderedCoastlineEdgeIds(topology)
    const coastalVertexIds = new Set<VertexId>()

    for (const edgeId of coastlineEdgeIds) {
      const edge = topology.edges[edgeId]
      expect(edge).toBeDefined()
      if (edge !== undefined) {
        coastalVertexIds.add(edge.vertexIds[0])
        coastalVertexIds.add(edge.vertexIds[1])
      }
    }

    expect(coastlineEdgeIds).toHaveLength(30)
    expect(new Set(coastlineEdgeIds).size).toBe(30)
    expect(coastalVertexIds.size).toBe(30)
    expect([...coastalVertexIds].sort()[0]).toBe('vertex:-1,-7,8')
    expect(coastlineEdgeIds[0]).toBe('edge:vertex:-1,-7,8|vertex:-2,-5,7')
  })

  it('uses the frozen non-adjacent port slots and preserves supplied kind order', () => {
    const topology = createStandardBoardTopology(PORT_KINDS)
    const coastlineEdgeIds = deriveOrderedCoastlineEdgeIds(topology)
    const selectedEdgeIds = STANDARD_PORT_SLOT_EDGE_INDICES.map(
      (index) => coastlineEdgeIds[index],
    )
    const occupiedVertexIds = new Set<VertexId>()

    expect(selectedEdgeIds).toEqual(EXPECTED_PORT_EDGE_IDS)
    expect(
      STANDARD_PORT_SLOT_EDGE_INDICES.map((index, slot) => {
        const next = STANDARD_PORT_SLOT_EDGE_INDICES[(slot + 1) % 9]
        if (next === undefined) {
          throw new Error('Missing next standard port slot.')
        }
        return (next - index + 30) % 30
      }),
    ).toEqual([3, 3, 4, 3, 3, 4, 3, 3, 4])

    for (let index = 0; index < EXPECTED_PORT_EDGE_IDS.length; index += 1) {
      const edgeId = EXPECTED_PORT_EDGE_IDS[index] as EdgeId
      const portId = createPortId(edgeId)
      const port = topology.ports[portId]
      const edge = topology.edges[edgeId]
      const suppliedKind = PORT_KINDS[index]
      expect(port).toBeDefined()
      expect(edge?.coastal).toBe(true)
      expect(port?.vertexIds).toEqual(edge?.vertexIds)
      expect(port?.kind).toEqual(suppliedKind)
      expect(port?.kind).not.toBe(suppliedKind)

      if (port !== undefined) {
        for (const vertexId of port.vertexIds) {
          expect(occupiedVertexIds.has(vertexId)).toBe(false)
          occupiedVertexIds.add(vertexId)
        }
      }
    }
  })

  it('does not mutate input and returns independent deterministic object graphs', () => {
    const frozenKinds = Object.freeze(
      PORT_KINDS.map((kind) => Object.freeze({ ...kind })) as unknown as NinePortKinds,
    )
    const inputBefore = JSON.stringify(frozenKinds)
    const first = createStandardBoardTopology(frozenKinds)
    const second = createStandardBoardTopology(frozenKinds)
    const centerTileId = 'tile:0,0' as TileId
    const centerVertexId = first.tiles[centerTileId]?.vertexIds[0]
    const centerEdgeId = first.tiles[centerTileId]?.edgeIds[0]
    const firstPortId = createPortId(EXPECTED_PORT_EDGE_IDS[0] as EdgeId)

    expect(JSON.stringify(frozenKinds)).toBe(inputBefore)
    expect(second).toEqual(first)
    expect(second).not.toBe(first)
    expect(second.tiles).not.toBe(first.tiles)
    expect(second.vertices).not.toBe(first.vertices)
    expect(second.edges).not.toBe(first.edges)
    expect(second.ports).not.toBe(first.ports)
    expect(second.tiles[centerTileId]).not.toBe(first.tiles[centerTileId])
    expect(second.tiles[centerTileId]?.vertexIds).not.toBe(first.tiles[centerTileId]?.vertexIds)
    if (centerVertexId !== undefined) {
      expect(second.vertices[centerVertexId]).not.toBe(first.vertices[centerVertexId])
      expect(second.vertices[centerVertexId]?.edgeIds).not.toBe(first.vertices[centerVertexId]?.edgeIds)
    }
    if (centerEdgeId !== undefined) {
      expect(second.edges[centerEdgeId]).not.toBe(first.edges[centerEdgeId])
      expect(second.edges[centerEdgeId]?.tileIds).not.toBe(first.edges[centerEdgeId]?.tileIds)
    }
    expect(second.ports[firstPortId]).not.toBe(first.ports[firstPortId])
    expect(second.ports[firstPortId]?.kind).not.toBe(first.ports[firstPortId]?.kind)
  })

  it('returns plain JSON data and defensively rejects a non-nine-item input', () => {
    const topology = createStandardBoardTopology(PORT_KINDS)
    const serialized = JSON.stringify(topology)

    expect(JSON.parse(serialized)).toEqual(topology)
    assertPlainJsonData(topology)
    expect(() =>
      createStandardBoardTopology([{ type: 'GENERIC' }] as unknown as NinePortKinds),
    ).toThrow(/exactly nine port kinds/)
  })
})
