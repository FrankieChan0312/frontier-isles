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

Task 02 uses exact integer scaled-cube geometry for shared corners. For cube center `(x, y, z)`, each center component is multiplied by three and one of these ordered offsets is added:

```text
( 2, -1, -1)
( 1,  1, -2)
(-1,  2, -1)
(-2,  1,  1)
(-1, -1,  2)
( 1, -2,  1)
```

Therefore each corner is `(3x, 3y, 3z) + orderedCornerOffset` and remains an exact zero-sum integer triplet. No floating-point or rendering geometry is used to identify shared corners.

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

The stable formats are:

```text
TileId   = tile:${q},${r}
VertexId = vertex:${x},${y},${z}
EdgeId   = edge:${lowerVertexId}|${higherVertexId}
PortId   = port:${edgeId}
```

Edge endpoints are ordered by direct code-unit comparison of the full vertex-ID strings. Locale-dependent comparison, array indices, insertion order, hashes, and random identifiers are not used.

Do not use array indexes as persistent IDs. Do not use random UUIDs for topology elements.

## 7. Deterministic coastline and port slots

The 30 coastal edges form one cycle. Its canonical traversal starts at the code-unit-smallest coastal vertex and follows the smaller of that vertex's two coastal neighbours first. The traversal must visit every coastal edge exactly once before returning to its start.

Nine ports attach at zero-based coastline edge indices:

```text
0, 3, 6, 10, 13, 16, 20, 23, 26
```

The cyclic gaps are `3, 3, 4, 3, 3, 4, 3, 3, 4`, so selected port edges do not share vertices. Task 02 accepts nine already ordered port kinds and preserves that order; it does not create, validate, or shuffle the eventual port-kind multiset.

## 8. Board generation

Topology and generated content remain separate. Task 02 constructs the fixed 19/54/72 graph and
port slots; Task 04 uses seeded randomness to populate a fresh initial `BoardState` without adding
content or occupancy to topology definitions.

The frozen terrain source order is:

```text
FOREST×4, HILLS×3, PASTURE×4, FIELDS×4, MOUNTAINS×3, DESERT×1
```

The four red tokens use source order `6, 6, 8, 8`. The non-red source order is:

```text
2, 3, 3, 4, 4, 5, 5, 9, 9, 10, 10, 11, 11, 12
```

The frozen port-kind source order is four generic ports followed by resource ports for Lumber,
Brick, Wool, Grain, and Ore. Fisher–Yates source order is deterministic input, not presentation
order.

Generation pipeline:

1. Shuffle the nine port kinds and create standard topology from that order.
2. Sort topology tiles by ascending `q`, then `r`.
3. Shuffle and assign the 19 terrains to those tiles.
4. Identify the desert and retain the other 18 IDs in sorted order.
5. Shuffle the 18 non-desert IDs for red-number candidate order.
6. Select the first four-tile independent set with a finite depth-first combination search.
7. Shuffle `6, 6, 8, 8` and assign them in selected red-tile order.
8. Shuffle the 14 non-red tokens and assign them to the remaining sorted non-desert IDs.
9. Build all tile contents, all-null vertex/edge occupancy, and place the robber on the desert.
10. Validate the complete initial standard board.

The constructive search guarantees that no accepted topology edge joins two red-number tiles. It
does not reshuffle or retry board generation. A new initial board has exactly 54 null vertex
occupancies, 72 null edge occupancies, and the robber on the sole unnumbered desert.

All random operations consume the seeded random source. A generation algorithm version must be saved so future code changes do not silently reinterpret old seeds.

```text
boardGeneratorVersion = STANDARD_RADIUS_2_V1
```

## 9. Rendering boundary

Domain data must not contain:

- SVG `x` or `y`
- polygon point strings
- CSS classes
- screen width/height
- zoom level
- animation state
- pointer/hover state

The V1 board renderer uses a flat-top orientation. For axial tile coordinate `(q, r)` and hex
circumradius `s`, it derives the tile centre as:

```text
tileCenterX = 3/2 × s × q
tileCenterY = √3 × s × (r + q/2)
```

For an accepted Task 02 scaled integer corner `(x, y, z)`, it derives the matching SVG vertex as:

```text
vertexX = s × x / 2
vertexY = √3 × s × (x + 2z) / 6
```

The renderer pairs each calculated integer corner with the corresponding accepted cyclic
`tile.vertexIds` entry. It never parses tile, vertex, edge, or port ID strings to obtain geometry.

The rendering layer may derive:

```text
hex center
six corner points
edge line endpoints
vertex screen points
number-token position
port icon position and rotation
```

A port marker is placed outward from its coastal-edge midpoint along the normalized vector from
the board-centre centroid to that midpoint. A single computed SVG `viewBox` contains all tile
corners, complete port marker rectangles, and padding, and provides responsive scaling without
placing screen dimensions in domain data.

Task 03 renders only a static, non-interactive topology preview with neutral land surfaces and port
labels. Terrain, number tokens, occupancy, pieces, legal highlights, and board interaction remain
outside that task.

## 10. Interaction layers

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

## 11. Derived board selectors

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

## 12. Longest Road algorithm requirements

The algorithm operates on the acting player's owned-edge subgraph.

It must:

- Never reuse an edge in one trail
- Allow revisiting a vertex when a loop topology permits it, provided no edge is reused
- Stop traversal through a vertex occupied by an opponent building
- Continue through the player's own building
- Evaluate every relevant starting edge/direction
- Return length and optionally one canonical path for debugging

Required graph fixtures include a line, fork, loop, loop with branch, opponent interruption, and multiple disconnected components.
