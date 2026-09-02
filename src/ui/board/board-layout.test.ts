import { compareCodeUnits } from '../../game/board/topology-ids.ts'
import type {
  BoardTopology,
  PortDefinition,
  VertexDefinition,
} from '../../game/model/board-state.ts'
import type { EdgeId, PortId, VertexId } from '../../game/model/ids.ts'
import {
  DEFAULT_BOARD_PADDING,
  DEFAULT_HEX_SIZE,
  DEFAULT_PORT_OFFSET,
  DEFAULT_PORT_MARKER_HEIGHT,
  DEFAULT_PORT_MARKER_WIDTH,
  createBoardSvgLayout,
  projectIntegerCorner,
  projectTileCenter,
  type BoardSvgLayoutOptions,
} from './board-layout.ts'
import { STANDARD_BOARD_PREVIEW_TOPOLOGY } from './standard-board-preview.ts'

const TOLERANCE = 0.000_000_001

function distance(
  left: { readonly x: number; readonly y: number },
  right: { readonly x: number; readonly y: number },
): number {
  return Math.sqrt((right.x - left.x) ** 2 + (right.y - left.y) ** 2)
}

function requireValue<Value>(value: Value | undefined, label: string): Value {
  if (value === undefined) {
    throw new Error(`Missing test fixture value: ${label}.`)
  }
  return value
}

function withoutVertex(
  vertices: Readonly<Record<VertexId, VertexDefinition>>,
  vertexId: VertexId,
): Readonly<Record<VertexId, VertexDefinition>> {
  const result: Record<VertexId, VertexDefinition> = {}
  for (const vertex of Object.values(vertices)) {
    if (vertex.id !== vertexId) {
      result[vertex.id] = vertex
    }
  }
  return result
}

function replacePort(topology: BoardTopology, replacement: PortDefinition): BoardTopology {
  const originalPort = requireValue(Object.values(topology.ports)[0], 'preview port')
  const ports: Record<PortId, PortDefinition> = {}
  for (const port of Object.values(topology.ports)) {
    if (port.id !== originalPort.id) {
      ports[port.id] = port
    }
  }
  ports[replacement.id] = replacement
  return { ...topology, ports }
}

describe('board SVG layout', () => {
  it('exports the frozen default layout constants', () => {
    expect(DEFAULT_HEX_SIZE).toBe(64)
    expect(DEFAULT_PORT_OFFSET).toBe(38)
    expect(DEFAULT_PORT_MARKER_WIDTH).toBe(58)
    expect(DEFAULT_PORT_MARKER_HEIGHT).toBe(28)
    expect(DEFAULT_BOARD_PADDING).toBe(24)
  })

  it('uses the frozen flat-top tile and integer-corner projections', () => {
    const hexSize = 64

    expect(projectTileCenter({ q: 0, r: 0 }, hexSize)).toEqual({ x: 0, y: 0 })
    expect(projectIntegerCorner({ x: 2, y: -1, z: -1 }, hexSize)).toEqual({
      x: hexSize,
      y: 0,
    })

    const secondCorner = projectIntegerCorner({ x: 1, y: 1, z: -2 }, hexSize)
    expect(secondCorner.x).toBeCloseTo(hexSize / 2, 12)
    expect(secondCorner.y).toBeCloseTo((-Math.sqrt(3) * hexSize) / 2, 12)
  })

  it('returns the accepted counts in explicit deterministic order', () => {
    const layout = createBoardSvgLayout(STANDARD_BOARD_PREVIEW_TOPOLOGY)

    expect(layout.tiles).toHaveLength(19)
    expect(layout.vertices).toHaveLength(54)
    expect(layout.edges).toHaveLength(72)
    expect(layout.ports).toHaveLength(9)
    expect(layout.tiles.map((tile) => tile.coordinate)).toEqual(
      [...layout.tiles]
        .sort(
          (left, right) =>
            left.coordinate.q - right.coordinate.q || left.coordinate.r - right.coordinate.r,
        )
        .map((tile) => tile.coordinate),
    )
    expect(layout.vertices.map((vertex) => vertex.vertexId)).toEqual(
      layout.vertices.map((vertex) => vertex.vertexId).sort(compareCodeUnits),
    )
    expect(layout.edges.map((edge) => edge.edgeId)).toEqual(
      layout.edges.map((edge) => edge.edgeId).sort(compareCodeUnits),
    )
    expect(layout.ports.map((port) => port.portId)).toEqual(
      layout.ports.map((port) => port.portId).sort(compareCodeUnits),
    )
  })

  it('creates regular cyclic hexagons, aligned shared vertices, and 3-4-5-4-3 columns', () => {
    const layout = createBoardSvgLayout(STANDARD_BOARD_PREVIEW_TOPOLOGY)
    const vertexById = new Map(layout.vertices.map((vertex) => [vertex.vertexId, vertex.point]))
    const tileById = new Map(layout.tiles.map((tile) => [tile.tileId, tile]))

    for (const tile of layout.tiles) {
      expect(tile.points).toHaveLength(6)
      expect(new Set(tile.pointString.split(' ')).size).toBe(6)
      for (let index = 0; index < tile.points.length; index += 1) {
        const point = requireValue(tile.points[index], 'tile point')
        const nextPoint = requireValue(tile.points[(index + 1) % 6], 'next tile point')
        expect(Number.isFinite(point.x)).toBe(true)
        expect(Number.isFinite(point.y)).toBe(true)
        expect(distance(point, nextPoint)).toBeCloseTo(DEFAULT_HEX_SIZE, 10)
      }
    }

    for (const tile of Object.values(STANDARD_BOARD_PREVIEW_TOPOLOGY.tiles)) {
      const tileLayout = requireValue(tileById.get(tile.id), 'tile layout')
      tile.vertexIds.forEach((vertexId, index) => {
        expect(tileLayout.points[index]).toEqual(vertexById.get(vertexId))
      })
    }

    const columnCounts = new Map<number, number>()
    for (const tile of layout.tiles) {
      columnCounts.set(tile.center.x, (columnCounts.get(tile.center.x) ?? 0) + 1)
    }
    expect([...columnCounts].sort(([left], [right]) => left - right).map(([, count]) => count)).toEqual([
      3, 4, 5, 4, 3,
    ])
  })

  it('projects every edge endpoint and midpoint from accepted vertex records', () => {
    const layout = createBoardSvgLayout(STANDARD_BOARD_PREVIEW_TOPOLOGY)
    const vertexById = new Map(layout.vertices.map((vertex) => [vertex.vertexId, vertex.point]))

    for (const edgeLayout of layout.edges) {
      const edge = requireValue(
        STANDARD_BOARD_PREVIEW_TOPOLOGY.edges[edgeLayout.edgeId],
        'topology edge',
      )
      const from = requireValue(vertexById.get(edge.vertexIds[0]), 'from vertex')
      const to = requireValue(vertexById.get(edge.vertexIds[1]), 'to vertex')
      expect(edgeLayout.from).toEqual(from)
      expect(edgeLayout.to).toEqual(to)
      expect(edgeLayout.midpoint).toEqual({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 })
    }
  })

  it('places every port marker outward from the board centroid', () => {
    const layout = createBoardSvgLayout(STANDARD_BOARD_PREVIEW_TOPOLOGY)
    const centroid = layout.tiles.reduce(
      (sum, tile) => ({ x: sum.x + tile.center.x, y: sum.y + tile.center.y }),
      { x: 0, y: 0 },
    )
    const boardCentroid = {
      x: centroid.x / layout.tiles.length,
      y: centroid.y / layout.tiles.length,
    }

    for (const port of layout.ports) {
      const outwardFromCentroid = {
        x: port.edgeMidpoint.x - boardCentroid.x,
        y: port.edgeMidpoint.y - boardCentroid.y,
      }
      const markerVector = {
        x: port.markerCenter.x - port.edgeMidpoint.x,
        y: port.markerCenter.y - port.edgeMidpoint.y,
      }
      expect(
        outwardFromCentroid.x * markerVector.x + outwardFromCentroid.y * markerVector.y,
      ).toBeGreaterThan(0)
      expect(distance(port.edgeMidpoint, port.markerCenter)).toBeCloseTo(DEFAULT_PORT_OFFSET, 10)
    }
  })

  it('computes finite padded bounds containing tiles and complete port rectangles', () => {
    const layout = createBoardSvgLayout(STANDARD_BOARD_PREVIEW_TOPOLOGY)
    const maximumX = layout.viewBox.minX + layout.viewBox.width
    const maximumY = layout.viewBox.minY + layout.viewBox.height

    expect(Number.isFinite(layout.viewBox.minX)).toBe(true)
    expect(Number.isFinite(layout.viewBox.minY)).toBe(true)
    expect(layout.viewBox.width).toBeGreaterThan(0)
    expect(layout.viewBox.height).toBeGreaterThan(0)
    expect(layout.aspectRatio).toBe(layout.viewBox.width / layout.viewBox.height)

    for (const tile of layout.tiles) {
      for (const point of tile.points) {
        expect(point.x).toBeGreaterThanOrEqual(layout.viewBox.minX + DEFAULT_BOARD_PADDING - TOLERANCE)
        expect(point.x).toBeLessThanOrEqual(maximumX - DEFAULT_BOARD_PADDING + TOLERANCE)
        expect(point.y).toBeGreaterThanOrEqual(layout.viewBox.minY + DEFAULT_BOARD_PADDING - TOLERANCE)
        expect(point.y).toBeLessThanOrEqual(maximumY - DEFAULT_BOARD_PADDING + TOLERANCE)
      }
    }
    for (const port of layout.ports) {
      expect(port.markerCenter.x - port.markerWidth / 2).toBeGreaterThanOrEqual(
        layout.viewBox.minX + DEFAULT_BOARD_PADDING - TOLERANCE,
      )
      expect(port.markerCenter.x + port.markerWidth / 2).toBeLessThanOrEqual(
        maximumX - DEFAULT_BOARD_PADDING + TOLERANCE,
      )
      expect(port.markerCenter.y - port.markerHeight / 2).toBeGreaterThanOrEqual(
        layout.viewBox.minY + DEFAULT_BOARD_PADDING - TOLERANCE,
      )
      expect(port.markerCenter.y + port.markerHeight / 2).toBeLessThanOrEqual(
        maximumY - DEFAULT_BOARD_PADDING + TOLERANCE,
      )
    }
  })

  it('rejects invalid options without mutating the options object', () => {
    const options = { hexSize: 70, portOffset: 40, portMarkerWidth: 60, portMarkerHeight: 30, padding: 20 }
    const before = JSON.stringify(options)

    expect(createBoardSvgLayout(STANDARD_BOARD_PREVIEW_TOPOLOGY, options).tiles).toHaveLength(19)
    expect(JSON.stringify(options)).toBe(before)
    for (const invalid of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        createBoardSvgLayout(STANDARD_BOARD_PREVIEW_TOPOLOGY, { hexSize: invalid }),
      ).toThrow(/hexSize.*finite and greater than zero/)
    }

    const invalidOptionFactories: readonly [
      readonly [string, (value: number) => BoardSvgLayoutOptions],
      readonly [string, (value: number) => BoardSvgLayoutOptions],
      readonly [string, (value: number) => BoardSvgLayoutOptions],
      readonly [string, (value: number) => BoardSvgLayoutOptions],
    ] = [
      ['portOffset', (value) => ({ portOffset: value })],
      ['portMarkerWidth', (value) => ({ portMarkerWidth: value })],
      ['portMarkerHeight', (value) => ({ portMarkerHeight: value })],
      ['padding', (value) => ({ padding: value })],
    ]
    for (const [optionName, createOptions] of invalidOptionFactories) {
      expect(() => createBoardSvgLayout(STANDARD_BOARD_PREVIEW_TOPOLOGY, createOptions(0))).toThrow(
        new RegExp(`${optionName}.*finite and greater than zero`),
      )
    }
  })

  it('rejects missing vertex geometry and invalid port edge references', () => {
    const topology = STANDARD_BOARD_PREVIEW_TOPOLOGY
    const firstTile = requireValue(Object.values(topology.tiles)[0], 'first tile')
    const missingVertexId = firstTile.vertexIds[0]
    const missingVertexTopology: BoardTopology = {
      ...topology,
      vertices: withoutVertex(topology.vertices, missingVertexId),
    }
    expect(() => createBoardSvgLayout(missingVertexTopology)).toThrow(/unknown vertex/)

    const originalPort = requireValue(Object.values(topology.ports)[0], 'first port')
    const unknownEdgeId = 'edge:unknown-preview-edge' as EdgeId
    const unknownEdgePort: PortDefinition = {
      ...originalPort,
      edgeId: unknownEdgeId,
    }
    expect(() => createBoardSvgLayout(replacePort(topology, unknownEdgePort))).toThrow(/unknown edge/)

    const interiorEdge = requireValue(
      Object.values(topology.edges).find((edge) => !edge.coastal),
      'interior edge',
    )
    const nonCoastalPort: PortDefinition = {
      ...originalPort,
      edgeId: interiorEdge.id,
      vertexIds: [interiorEdge.vertexIds[0], interiorEdge.vertexIds[1]],
    }
    expect(() => createBoardSvgLayout(replacePort(topology, nonCoastalPort))).toThrow(/coastal edge/)
  })

  it('is deterministic, non-mutating, JSON-safe, and independent across calls', () => {
    const topologyBefore = JSON.stringify(STANDARD_BOARD_PREVIEW_TOPOLOGY)
    const options = { hexSize: 64, padding: 24 } as const
    const optionsBefore = JSON.stringify(options)
    const first = createBoardSvgLayout(STANDARD_BOARD_PREVIEW_TOPOLOGY, options)
    const second = createBoardSvgLayout(STANDARD_BOARD_PREVIEW_TOPOLOGY, options)

    expect(second).toEqual(first)
    expect(JSON.parse(JSON.stringify(first))).toEqual(first)
    expect(second).not.toBe(first)
    expect(second.tiles).not.toBe(first.tiles)
    expect(second.tiles[0]).not.toBe(first.tiles[0])
    expect(second.tiles[0]?.points).not.toBe(first.tiles[0]?.points)
    expect(second.vertices[0]?.point).not.toBe(first.vertices[0]?.point)
    expect(second.edges[0]?.midpoint).not.toBe(first.edges[0]?.midpoint)
    expect(second.ports[0]?.markerCenter).not.toBe(first.ports[0]?.markerCenter)
    expect(second.ports[0]?.kind).not.toBe(first.ports[0]?.kind)
    expect(JSON.stringify(STANDARD_BOARD_PREVIEW_TOPOLOGY)).toBe(topologyBefore)
    expect(JSON.stringify(options)).toBe(optionsBefore)
  })
})
