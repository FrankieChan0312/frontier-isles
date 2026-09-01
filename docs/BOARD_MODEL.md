# Board Model

## 1. Core decision

The board is a graph, not a set of independent visual hexagons.

```text
Tile       owns terrain/number adjacency
Vertex     hosts settlement or city
Edge       hosts road
Port       is attached to one coastal edge and serves its two vertices
```

The engine stores topology and occupancy separately. SVG pixel positions are a rendering concern.

## 2. Standard-board invariants

The radius-two land board must contain exactly:

```text
19 unique tiles
54 unique vertices
72 unique edges
```

Other required invariants:

- Every tile references six vertices and six edges
- Every edge references exactly two vertices
- Interior edge belongs to two tiles
- Coastal edge belongs to one tile
- Vertex adjacency is symmetric
- Edge-to-tile and tile-to-edge relations agree
- Shared physical corners produce one vertex ID
- Shared physical sides produce one edge ID
- Nine ports occupy valid distinct coastal edges

Task 02, not Task 00, implements and tests these invariants.

## 3. Hex coordinates

Tiles use axial coordinates:

```ts
export interface HexCoordinate {
  readonly q: number;
  readonly r: number;
}
```

The radius-two board contains all axial coordinates whose cube-coordinate distance from the origin is at most two.

Axial coordinates are domain data. The SVG layer converts them into screen coordinates using a consistent pointy-top or flat-top orientation selected in the board-layout module.

## 4. Topology

Conceptual contracts:

```ts
export interface BoardTopology {
  readonly tiles: Readonly<Record<TileId, TileDefinition>>;
  readonly vertices: Readonly<Record<VertexId, VertexDefinition>>;
  readonly edges: Readonly<Record<EdgeId, EdgeDefinition>>;
  readonly ports: Readonly<Record<PortId, PortDefinition>>;
}
```

```ts
export interface TileDefinition {
  readonly id: TileId;
  readonly coordinate: HexCoordinate;
  readonly vertexIds: readonly [
    VertexId, VertexId, VertexId,
    VertexId, VertexId, VertexId
  ];
  readonly edgeIds: readonly [
    EdgeId, EdgeId, EdgeId,
    EdgeId, EdgeId, EdgeId
  ];
}
```

```ts
export interface VertexDefinition {
  readonly id: VertexId;
  readonly adjacentVertexIds: readonly VertexId[];
  readonly edgeIds: readonly EdgeId[];
  readonly tileIds: readonly TileId[];
}
```

```ts
export interface EdgeDefinition {
  readonly id: EdgeId;
  readonly vertexIds: readonly [VertexId, VertexId];
  readonly tileIds: readonly TileId[];
  readonly coastal: boolean;
}
```

```ts
export interface PortDefinition {
  readonly id: PortId;
  readonly edgeId: EdgeId;
  readonly vertexIds: readonly [VertexId, VertexId];
  readonly kind: PortKind;
}
```

A port has no stored owner. Port access is derived from building occupancy at either endpoint.

## 5. Occupancy and tile content

```ts
export interface BoardState {
  readonly topology: BoardTopology;
  readonly tileContents: Readonly<Record<TileId, TileContent>>;
  readonly vertexOccupancy: Readonly<Record<VertexId, Building | null>>;
  readonly edgeOccupancy: Readonly<Record<EdgeId, Road | null>>;
  readonly robberTileId: TileId;
}
```

```ts
export interface TileContent {
  readonly terrain: TerrainType;
  readonly numberToken: NumberToken | null;
}
```

```ts
export type Building =
  | { readonly type: "SETTLEMENT"; readonly ownerId: PlayerId }
  | { readonly type: "CITY"; readonly ownerId: PlayerId };
```

```ts
export interface Road {
  readonly ownerId: PlayerId;
}
```

## 6. Stable identifiers

Identifiers must be deterministic and independent of render order.

Recommended strategy:

- Tile ID derives from axial coordinate
- Vertex ID derives from a normalized integer geometric corner coordinate
- Edge ID derives from its two sorted vertex IDs
- Port ID derives from its coastal edge ID

Do not use array indexes as persistent IDs. Do not use random UUIDs for topology elements.

## 7. Board generation

The digital variable setup uses the frozen component distribution.

Generation pipeline:

1. Generate standard topology
2. Shuffle terrain multiset
3. Place desert and initial robber
4. Shuffle number-token multiset
5. Assign tokens to non-desert tiles while enforcing no adjacent red numbers
6. Shuffle port multiset
7. Assign ports to the frozen set of nine spaced coastal slots
8. Validate all invariants

All random operations consume the seeded random source. A generation algorithm version must be saved so future code changes do not silently reinterpret old seeds.

```text
boardGeneratorVersion = STANDARD_RADIUS_2_V1
```

## 8. Rendering boundary

Domain data must not contain:

- SVG `x` or `y`
- polygon point strings
- CSS classes
- screen width/height
- zoom level
- animation state
- pointer/hover state

The rendering layer may derive:

```text
hex center
six corner points
edge line endpoints
vertex screen points
number-token position
port icon position and rotation
```

A single SVG `viewBox` provides responsive scaling.

## 9. Interaction layers

Recommended SVG draw order:

1. Sea/background
2. Terrain polygons
3. Port indicators
4. Number tokens
5. Robber
6. Existing roads
7. Existing buildings
8. Legal-placement hit areas
9. Hover/selection overlays
10. Accessible labels/tooltips

Large invisible hit areas may improve usability, but they must map to stable domain IDs.

## 10. Derived board selectors

Do not duplicate these facts in player state:

- Roads owned by player
- Buildings owned by player
- Piece supply remaining
- Controlled ports
- Adjacent producing tiles
- Legal road edges
- Legal settlement vertices
- Legal city-upgrade vertices
- Longest road length

They are derived from topology, occupancy, turn state, resources, and rules.

## 11. Longest Road algorithm requirements

The algorithm operates on the acting player's owned-edge subgraph.

It must:

- Never reuse an edge in one trail
- Allow revisiting a vertex when a loop topology permits it, provided no edge is reused
- Stop traversal through a vertex occupied by an opponent building
- Continue through the player's own building
- Evaluate every relevant starting edge/direction
- Return length and optionally one canonical path for debugging

Required graph fixtures include a line, fork, loop, loop with branch, opponent interruption, and multiple disconnected components.
