import type { NumberToken } from './dice.ts'
import type { EdgeId, PlayerId, PortId, TileId, VertexId } from './ids.ts'
import type { ResourceType } from './resource.ts'
import { BOARD_GENERATOR_VERSION } from './ruleset.ts'

export type TerrainType =
  | 'FOREST'
  | 'HILLS'
  | 'PASTURE'
  | 'FIELDS'
  | 'MOUNTAINS'
  | 'DESERT'

export interface HexCoordinate {
  readonly q: number
  readonly r: number
}

export type PortKind =
  | { readonly type: 'GENERIC' }
  | { readonly type: 'RESOURCE'; readonly resource: ResourceType }

export interface TileDefinition {
  readonly id: TileId
  readonly coordinate: HexCoordinate
  readonly vertexIds: readonly [VertexId, VertexId, VertexId, VertexId, VertexId, VertexId]
  readonly edgeIds: readonly [EdgeId, EdgeId, EdgeId, EdgeId, EdgeId, EdgeId]
}

export interface VertexDefinition {
  readonly id: VertexId
  readonly adjacentVertexIds: readonly VertexId[]
  readonly edgeIds: readonly EdgeId[]
  readonly tileIds: readonly TileId[]
}

export interface EdgeDefinition {
  readonly id: EdgeId
  readonly vertexIds: readonly [VertexId, VertexId]
  readonly tileIds: readonly TileId[]
  readonly coastal: boolean
}

export interface PortDefinition {
  readonly id: PortId
  readonly edgeId: EdgeId
  readonly vertexIds: readonly [VertexId, VertexId]
  readonly kind: PortKind
}

export interface BoardTopology {
  readonly tiles: Readonly<Record<TileId, TileDefinition>>
  readonly vertices: Readonly<Record<VertexId, VertexDefinition>>
  readonly edges: Readonly<Record<EdgeId, EdgeDefinition>>
  readonly ports: Readonly<Record<PortId, PortDefinition>>
}

export interface TileContent {
  readonly terrain: TerrainType
  readonly numberToken: NumberToken | null
}

export type Building =
  | { readonly type: 'SETTLEMENT'; readonly ownerId: PlayerId }
  | { readonly type: 'CITY'; readonly ownerId: PlayerId }

export interface Road {
  readonly ownerId: PlayerId
}

export interface BoardState {
  readonly generatorVersion: typeof BOARD_GENERATOR_VERSION
  readonly topology: BoardTopology
  readonly tileContents: Readonly<Record<TileId, TileContent>>
  readonly vertexOccupancy: Readonly<Record<VertexId, Building | null>>
  readonly edgeOccupancy: Readonly<Record<EdgeId, Road | null>>
  readonly robberTileId: TileId
}

