import {
  createIntegerCornerCoordinate,
  ORDERED_CORNER_INDICES,
  type IntegerCornerCoordinate,
} from '../../game/board/coordinates.ts'
import { compareCodeUnits } from '../../game/board/topology-ids.ts'
import type {
  BoardTopology,
  HexCoordinate,
  PortKind,
  TileDefinition,
} from '../../game/model/board-state.ts'
import type { EdgeId, PortId, TileId, VertexId } from '../../game/model/ids.ts'
import { formatPortAccessibleLabel, formatPortLabel } from './port-label.ts'

export const DEFAULT_HEX_SIZE = 64
export const DEFAULT_PORT_OFFSET = 38
export const DEFAULT_PORT_MARKER_WIDTH = 58
export const DEFAULT_PORT_MARKER_HEIGHT = 28
export const DEFAULT_BOARD_PADDING = 24

const SQUARE_ROOT_OF_THREE = Math.sqrt(3)

export interface SvgPoint {
  readonly x: number
  readonly y: number
}

export interface SvgViewBox {
  readonly minX: number
  readonly minY: number
  readonly width: number
  readonly height: number
}

export interface TileSvgLayout {
  readonly tileId: TileId
  readonly coordinate: HexCoordinate
  readonly center: SvgPoint
  readonly points: readonly [SvgPoint, SvgPoint, SvgPoint, SvgPoint, SvgPoint, SvgPoint]
  readonly pointString: string
}

export interface VertexSvgLayout {
  readonly vertexId: VertexId
  readonly point: SvgPoint
}

export interface EdgeSvgLayout {
  readonly edgeId: EdgeId
  readonly from: SvgPoint
  readonly to: SvgPoint
  readonly midpoint: SvgPoint
  readonly coastal: boolean
}

export interface PortSvgLayout {
  readonly portId: PortId
  readonly edgeId: EdgeId
  readonly edgeMidpoint: SvgPoint
  readonly markerCenter: SvgPoint
  readonly markerWidth: number
  readonly markerHeight: number
  readonly kind: PortKind
  readonly label: string
  readonly accessibleLabel: string
}

export interface BoardSvgLayout {
  readonly viewBox: SvgViewBox
  readonly aspectRatio: number
  readonly tiles: readonly TileSvgLayout[]
  readonly vertices: readonly VertexSvgLayout[]
  readonly edges: readonly EdgeSvgLayout[]
  readonly ports: readonly PortSvgLayout[]
}

export interface BoardSvgLayoutOptions {
  readonly hexSize?: number
  readonly portOffset?: number
  readonly portMarkerWidth?: number
  readonly portMarkerHeight?: number
  readonly padding?: number
}

interface ResolvedBoardSvgLayoutOptions {
  readonly hexSize: number
  readonly portOffset: number
  readonly portMarkerWidth: number
  readonly portMarkerHeight: number
  readonly padding: number
}

function assertPositiveFiniteOption(name: string, value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Board SVG layout option ${name} must be finite and greater than zero.`)
  }

  return value
}

function resolveOptions(options: BoardSvgLayoutOptions): ResolvedBoardSvgLayoutOptions {
  return {
    hexSize: assertPositiveFiniteOption('hexSize', options.hexSize ?? DEFAULT_HEX_SIZE),
    portOffset: assertPositiveFiniteOption(
      'portOffset',
      options.portOffset ?? DEFAULT_PORT_OFFSET,
    ),
    portMarkerWidth: assertPositiveFiniteOption(
      'portMarkerWidth',
      options.portMarkerWidth ?? DEFAULT_PORT_MARKER_WIDTH,
    ),
    portMarkerHeight: assertPositiveFiniteOption(
      'portMarkerHeight',
      options.portMarkerHeight ?? DEFAULT_PORT_MARKER_HEIGHT,
    ),
    padding: assertPositiveFiniteOption('padding', options.padding ?? DEFAULT_BOARD_PADDING),
  }
}

function assertFinitePoint(point: SvgPoint, context: string): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new Error(`${context} produced a non-finite SVG point.`)
  }
}

function clonePoint(point: SvgPoint): SvgPoint {
  return { x: point.x, y: point.y }
}

function clonePortKind(kind: PortKind): PortKind {
  return kind.type === 'GENERIC'
    ? { type: 'GENERIC' }
    : { type: 'RESOURCE', resource: kind.resource }
}

function asPointTuple(points: readonly SvgPoint[], tileId: TileId): TileSvgLayout['points'] {
  if (points.length !== 6) {
    throw new Error(`Tile ${tileId} requires exactly six projected SVG points.`)
  }

  const [first, second, third, fourth, fifth, sixth] = points
  if (
    first === undefined ||
    second === undefined ||
    third === undefined ||
    fourth === undefined ||
    fifth === undefined ||
    sixth === undefined
  ) {
    throw new Error(`Tile ${tileId} has an incomplete projected SVG point tuple.`)
  }

  return [first, second, third, fourth, fifth, sixth]
}

function sortedTiles(topology: BoardTopology): readonly TileDefinition[] {
  return (Object.keys(topology.tiles) as TileId[])
    .map((tileId) => topology.tiles[tileId])
    .filter((tile): tile is TileDefinition => tile !== undefined)
    .sort(
      (left, right) =>
        left.coordinate.q - right.coordinate.q ||
        left.coordinate.r - right.coordinate.r ||
        compareCodeUnits(left.id, right.id),
    )
}

export function projectTileCenter(coordinate: HexCoordinate, hexSize: number): SvgPoint {
  assertPositiveFiniteOption('hexSize', hexSize)
  const point = {
    x: (3 / 2) * hexSize * coordinate.q,
    y: SQUARE_ROOT_OF_THREE * hexSize * (coordinate.r + coordinate.q / 2),
  }
  assertFinitePoint(point, `Tile (${coordinate.q},${coordinate.r})`)
  return point
}

export function projectIntegerCorner(
  coordinate: IntegerCornerCoordinate,
  hexSize: number,
): SvgPoint {
  assertPositiveFiniteOption('hexSize', hexSize)
  const point = {
    x: (hexSize * coordinate.x) / 2,
    y: (SQUARE_ROOT_OF_THREE * hexSize * (coordinate.x + 2 * coordinate.z)) / 6,
  }
  assertFinitePoint(point, `Integer corner (${coordinate.x},${coordinate.y},${coordinate.z})`)
  return point
}

function createTileAndVertexLayouts(
  topology: BoardTopology,
  hexSize: number,
): {
  readonly tiles: readonly TileSvgLayout[]
  readonly vertexPointById: ReadonlyMap<VertexId, SvgPoint>
} {
  const vertexPointById = new Map<VertexId, SvgPoint>()
  const tiles = sortedTiles(topology).map((tile): TileSvgLayout => {
    const points = asPointTuple(
      ORDERED_CORNER_INDICES.map((cornerIndex) => {
        const vertexId = tile.vertexIds[cornerIndex]
        if (topology.vertices[vertexId] === undefined) {
          throw new Error(`Tile ${tile.id} references unknown vertex ${vertexId}.`)
        }

        const point = projectIntegerCorner(
          createIntegerCornerCoordinate(tile.coordinate, cornerIndex),
          hexSize,
        )
        const existingPoint = vertexPointById.get(vertexId)
        if (
          existingPoint !== undefined &&
          (existingPoint.x !== point.x || existingPoint.y !== point.y)
        ) {
          throw new Error(
            `Vertex ${vertexId} maps to inconsistent SVG points across accepted tile corners.`,
          )
        }

        if (existingPoint === undefined) {
          vertexPointById.set(vertexId, clonePoint(point))
        }

        return clonePoint(point)
      }),
      tile.id,
    )

    return {
      tileId: tile.id,
      coordinate: { q: tile.coordinate.q, r: tile.coordinate.r },
      center: projectTileCenter(tile.coordinate, hexSize),
      points,
      pointString: points.map((point) => `${point.x},${point.y}`).join(' '),
    }
  })

  return { tiles, vertexPointById }
}

function createVertexLayouts(
  topology: BoardTopology,
  vertexPointById: ReadonlyMap<VertexId, SvgPoint>,
): readonly VertexSvgLayout[] {
  return (Object.keys(topology.vertices) as VertexId[]).sort(compareCodeUnits).map((vertexId) => {
    const point = vertexPointById.get(vertexId)
    if (point === undefined) {
      throw new Error(`Vertex ${vertexId} has no projected point from an accepted tile corner.`)
    }

    return { vertexId, point: clonePoint(point) }
  })
}

function createEdgeLayouts(
  topology: BoardTopology,
  vertexPointById: ReadonlyMap<VertexId, SvgPoint>,
): readonly EdgeSvgLayout[] {
  return (Object.keys(topology.edges) as EdgeId[]).sort(compareCodeUnits).map((edgeId) => {
    const edge = topology.edges[edgeId]
    if (edge === undefined) {
      throw new Error(`Cannot project unknown edge ${edgeId}.`)
    }

    const from = vertexPointById.get(edge.vertexIds[0])
    const to = vertexPointById.get(edge.vertexIds[1])
    if (from === undefined || to === undefined) {
      throw new Error(`Edge ${edgeId} references a vertex without projected SVG geometry.`)
    }

    return {
      edgeId,
      from: clonePoint(from),
      to: clonePoint(to),
      midpoint: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 },
      coastal: edge.coastal,
    }
  })
}

function calculateTileCentroid(tiles: readonly TileSvgLayout[]): SvgPoint {
  if (tiles.length === 0) {
    throw new Error('Board SVG layout requires at least one tile to calculate its centroid.')
  }

  const totals = tiles.reduce(
    (sum, tile) => ({ x: sum.x + tile.center.x, y: sum.y + tile.center.y }),
    { x: 0, y: 0 },
  )
  return { x: totals.x / tiles.length, y: totals.y / tiles.length }
}

function createPortLayouts(
  topology: BoardTopology,
  edges: readonly EdgeSvgLayout[],
  tileCentroid: SvgPoint,
  options: ResolvedBoardSvgLayoutOptions,
): readonly PortSvgLayout[] {
  const edgeLayoutById = new Map(edges.map((edge) => [edge.edgeId, edge] as const))

  return (Object.keys(topology.ports) as PortId[]).sort(compareCodeUnits).map((portId) => {
    const port = topology.ports[portId]
    if (port === undefined) {
      throw new Error(`Cannot project unknown port ${portId}.`)
    }

    const edge = topology.edges[port.edgeId]
    const edgeLayout = edgeLayoutById.get(port.edgeId)
    if (edge === undefined || edgeLayout === undefined) {
      throw new Error(`Port ${portId} references unknown edge ${port.edgeId}.`)
    }
    if (!edge.coastal || !edgeLayout.coastal) {
      throw new Error(`Port ${portId} must reference a coastal edge; received ${port.edgeId}.`)
    }

    const outwardX = edgeLayout.midpoint.x - tileCentroid.x
    const outwardY = edgeLayout.midpoint.y - tileCentroid.y
    const outwardLength = Math.hypot(outwardX, outwardY)
    if (!Number.isFinite(outwardLength) || outwardLength <= 0) {
      throw new Error(`Port ${portId} has no finite non-zero outward vector from the board centroid.`)
    }

    const kind = clonePortKind(port.kind)
    return {
      portId,
      edgeId: port.edgeId,
      edgeMidpoint: clonePoint(edgeLayout.midpoint),
      markerCenter: {
        x: edgeLayout.midpoint.x + (outwardX / outwardLength) * options.portOffset,
        y: edgeLayout.midpoint.y + (outwardY / outwardLength) * options.portOffset,
      },
      markerWidth: options.portMarkerWidth,
      markerHeight: options.portMarkerHeight,
      kind,
      label: formatPortLabel(kind),
      accessibleLabel: formatPortAccessibleLabel(kind),
    }
  })
}

function createViewBox(
  tiles: readonly TileSvgLayout[],
  ports: readonly PortSvgLayout[],
  padding: number,
): SvgViewBox {
  const xs = tiles.flatMap((tile) => tile.points.map((point) => point.x))
  const ys = tiles.flatMap((tile) => tile.points.map((point) => point.y))

  for (const port of ports) {
    xs.push(port.markerCenter.x - port.markerWidth / 2, port.markerCenter.x + port.markerWidth / 2)
    ys.push(
      port.markerCenter.y - port.markerHeight / 2,
      port.markerCenter.y + port.markerHeight / 2,
    )
  }

  const geometryMinX = Math.min(...xs)
  const geometryMaxX = Math.max(...xs)
  const geometryMinY = Math.min(...ys)
  const geometryMaxY = Math.max(...ys)
  const viewBox = {
    minX: geometryMinX - padding,
    minY: geometryMinY - padding,
    width: geometryMaxX - geometryMinX + 2 * padding,
    height: geometryMaxY - geometryMinY + 2 * padding,
  }

  if (
    !Number.isFinite(viewBox.minX) ||
    !Number.isFinite(viewBox.minY) ||
    !Number.isFinite(viewBox.width) ||
    !Number.isFinite(viewBox.height) ||
    viewBox.width <= 0 ||
    viewBox.height <= 0
  ) {
    throw new Error('Board SVG layout produced an invalid computed viewBox.')
  }

  return viewBox
}

export function createBoardSvgLayout(
  topology: BoardTopology,
  options: BoardSvgLayoutOptions = {},
): BoardSvgLayout {
  const resolvedOptions = resolveOptions(options)
  const tileAndVertexLayouts = createTileAndVertexLayouts(topology, resolvedOptions.hexSize)
  const vertices = createVertexLayouts(topology, tileAndVertexLayouts.vertexPointById)
  const edges = createEdgeLayouts(topology, tileAndVertexLayouts.vertexPointById)
  const ports = createPortLayouts(
    topology,
    edges,
    calculateTileCentroid(tileAndVertexLayouts.tiles),
    resolvedOptions,
  )
  const viewBox = createViewBox(tileAndVertexLayouts.tiles, ports, resolvedOptions.padding)

  return {
    viewBox,
    aspectRatio: viewBox.width / viewBox.height,
    tiles: tileAndVertexLayouts.tiles,
    vertices,
    edges,
    ports,
  }
}
