# Task 02 — Deterministic Standard Board Topology

## Status

Ready for Codex implementation after Task 01 is accepted and committed as a clean baseline.

## Objective

Implement the deterministic, pure TypeScript graph topology for the standard radius-two land board.

This task creates and verifies:

- the exact 19 axial tile coordinates;
- stable coordinate-derived tile, vertex, edge, and port identifiers;
- exact deduplication of shared physical corners and sides without floating-point geometry;
- 54 unique vertices and 72 unique edges;
- complete reciprocal tile/vertex/edge adjacency;
- 42 interior edges and 30 coastal edges;
- one deterministic 30-edge coastline cycle;
- nine frozen, non-adjacent port slots;
- creation of a complete `BoardTopology` from an ordered tuple of nine supplied `PortKind` values;
- invariant checks and focused tests.

This task does **not** create terrain, number tokens, a robber position, occupancy, `BoardState`, seeded RNG behaviour, SVG coordinates, game rules, selectors, AI, stores, persistence, or UI.

## Mandatory reading

Read in this order before changing code:

1. `AGENTS.md`
2. `docs/PRODUCT_SCOPE.md`
3. `docs/GAME_RULES.md`
4. `docs/ARCHITECTURE.md`
5. `docs/BOARD_MODEL.md`
6. `docs/CODING_STANDARDS.md`
7. `docs/adr/ADR-0001-v1-architecture-baseline.md`
8. `tasks/TASK_01_DOMAIN_CONTRACTS.md`
9. This task file

Inspect the accepted Task 01 contracts before writing. Reuse their exact exported branded IDs, `HexCoordinate`, `BoardTopology`, `TileDefinition`, `VertexDefinition`, `EdgeDefinition`, `PortDefinition`, and `PortKind`; do not duplicate or replace those contracts.

## Preflight

1. Run `git status --short` and report the result.
2. The expected starting tree is clean except for the newly supplied Task 02 files under `tasks/`.
3. Run `npm run check` before changing production source. Stop and report if the accepted Task 01 baseline fails.
4. Do not alter package versions or install dependencies.
5. Do not create a Git commit.

# Frozen topology decisions

## 1. Standard radius-two tile set

Tiles use the accepted axial coordinate contract:

```ts
export interface HexCoordinate {
  readonly q: number;
  readonly r: number;
}
```

Convert axial coordinates to cube coordinates as:

```text
x = q
y = -q - r
z = r
```

A coordinate belongs to the standard board exactly when:

```text
max(abs(x), abs(y), abs(z)) <= 2
```

Generate all matching coordinates algorithmically and sort them by:

1. ascending `q`;
2. then ascending `r`.

The exact expected ordered coordinate list for independent tests is:

```text
(-2, 0), (-2, 1), (-2, 2),
(-1,-1), (-1, 0), (-1, 1), (-1, 2),
( 0,-2), ( 0,-1), ( 0, 0), ( 0, 1), ( 0, 2),
( 1,-2), ( 1,-1), ( 1, 0), ( 1, 1),
( 2,-2), ( 2,-1), ( 2, 0)
```

Do not hard-code 19 independent tile objects. A frozen radius constant is allowed. Tests must compare against the independent list above rather than regenerate the expectation with the production algorithm.

## 2. Exact integer corner geometry

Do not use trigonometry, `Math.sin`, `Math.cos`, pixels, rounding, epsilon comparisons, or floating-point corner coordinates.

For a tile with cube center `(x, y, z)`, multiply the center by 3 and add one of these six ordered corner offsets:

```text
corner 0: ( 2, -1, -1)
corner 1: ( 1,  1, -2)
corner 2: (-1,  2, -1)
corner 3: (-2,  1,  1)
corner 4: (-1, -1,  2)
corner 5: ( 1, -2,  1)
```

Therefore:

```text
corner = (3x, 3y, 3z) + orderedCornerOffset
```

Every generated corner coordinate must satisfy:

```text
cornerX + cornerY + cornerZ = 0
```

The same physical corner reached from adjacent tiles must produce the same integer triplet and therefore the same `VertexId`.

A small readonly `IntegerCornerCoordinate` interface may be exported from the board coordinate module for testing and trusted ID construction. It is topology geometry, not SVG geometry, and must never be added to `GameState` or rendering contracts.

## 3. Tile corner and edge ordering

For every `TileDefinition`:

- `vertexIds[i]` is the vertex produced by ordered corner `i` above;
- `edgeIds[i]` connects `vertexIds[i]` to `vertexIds[(i + 1) % 6]`;
- the six-element tuple order must remain stable;
- each tuple must contain six distinct IDs.

Do not sort the six tile vertices or six tile edges after construction; their cyclic correspondence is part of the topology contract.

## 4. Exact stable identifier formats

Identifiers are deterministic strings cast to the accepted branded ID types only at these trusted topology-construction boundaries.

Use these exact formats:

```text
TileId   = `tile:${q},${r}`
VertexId = `vertex:${x},${y},${z}`
EdgeId   = `edge:${lowerVertexId}|${higherVertexId}`
PortId   = `port:${edgeId}`
```

For an edge, order the two full vertex-ID strings with a deterministic code-unit comparator:

```ts
left < right ? -1 : left > right ? 1 : 0
```

Do not use `localeCompare`, array position, insertion order, UUIDs, hashes, or randomness to create topology IDs.

Provide narrowly named pure helpers in the board layer for these conversions. They must reject impossible trusted-boundary inputs such as an edge whose two endpoint IDs are equal.

## 5. Vertex and edge deduplication

Build all 19 tiles, then deduplicate vertices by exact `VertexId` and edges by exact `EdgeId`.

Temporary local `Map`/`Set` values are permitted inside the pure generator for construction and validation, but:

- they must not appear in returned contracts;
- they must not be stored in `GameState`;
- all returned data must be plain JSON-serializable objects and arrays.

Every returned adjacency array must be a fresh readonly array sorted with the same deterministic code-unit comparator, except the cyclic six-element tuples on each tile, which preserve corner order.

## 6. Required graph facts

The completed land graph must contain exactly:

```text
19 tiles
54 vertices
72 edges
```

Required incidence facts:

```text
42 interior edges with 2 adjacent tiles
30 coastal edges with 1 adjacent tile
0 edges with any other tile count

36 vertices with 3 incident edges
18 vertices with 2 incident edges
0 vertices with any other incident-edge count

24 vertices adjacent to 3 tiles
12 vertices adjacent to 2 tiles
18 vertices adjacent to 1 tile
0 vertices with any other adjacent-tile count
```

Every relationship must be reciprocal:

- tile → vertex and vertex → tile;
- tile → edge and edge → tile;
- edge → endpoint vertex and vertex → edge;
- vertex → adjacent vertex in both directions;
- `edge.coastal === (edge.tileIds.length === 1)`.

No adjacency list may contain duplicates or an unknown ID.

## 7. Deterministic coastline cycle

The 30 coastal edges must form one simple cycle containing exactly 30 distinct coastal vertices.

Create a deterministic ordered coastline edge list as follows:

1. Build the coastal vertex graph from edges whose `coastal` flag is `true`.
2. Assert every coastal vertex has exactly two coastal neighbours.
3. Select the smallest coastal `VertexId` using the frozen code-unit comparator as the start vertex.
4. Of its two coastal neighbouring vertex IDs, select the smaller as the first direction.
5. Traverse without reusing an edge until returning to the start vertex.
6. Assert that exactly 30 distinct edges were visited and that no coastal edge was omitted.

Expose a pure function that derives this ordered coastal edge tuple/list from a `BoardTopology` or from the internally completed land graph. It must not rely on object insertion order.

## 8. Frozen port slots

The topology factory receives an ordered tuple of exactly nine `PortKind` values:

```ts
export type NinePortKinds = readonly [
  PortKind,
  PortKind,
  PortKind,
  PortKind,
  PortKind,
  PortKind,
  PortKind,
  PortKind,
  PortKind,
];
```

Given the deterministic 30-edge coastline cycle, assign the nine supplied kinds to these exact zero-based coastline edge indices:

```ts
export const STANDARD_PORT_SLOT_EDGE_INDICES = [
  0,
  3,
  6,
  10,
  13,
  16,
  20,
  23,
  26,
] as const;
```

The cyclic gaps are therefore:

```text
3, 3, 4, 3, 3, 4, 3, 3, 4
```

For each slot:

- create one `PortDefinition`;
- derive its `PortId` from the selected coastal `EdgeId`;
- copy the selected edge's canonical `vertexIds` tuple exactly;
- clone the supplied `PortKind` into plain returned data;
- preserve input kind order: input index `i` belongs to port slot index `i`.

The nine port edges must be distinct, coastal, and pairwise non-adjacent; no two selected port edges may share a vertex.

This task validates port geometry only. It does **not** validate or create the eventual official port-kind multiset. The later seeded board-content task will supply the shuffled nine kinds.

### Reference outputs fixed by the decisions above

These values are independent acceptance anchors and must be asserted in tests:

```text
coastline start vertex:
vertex:-1,-7,8

first coastline edge:
edge:vertex:-1,-7,8|vertex:-2,-5,7
```

The exact nine selected coastal edge IDs, in port-kind input order, are:

```text
edge:vertex:-1,-7,8|vertex:-2,-5,7
edge:vertex:-5,-2,7|vertex:-7,-1,8
edge:vertex:-7,2,5|vertex:-8,4,4
edge:vertex:-5,7,-2|vertex:-7,8,-1
edge:vertex:-1,8,-7|vertex:-2,7,-5
edge:vertex:2,5,-7|vertex:4,4,-8
edge:vertex:7,-2,-5|vertex:8,-1,-7
edge:vertex:7,-5,-2|vertex:8,-7,-1
edge:vertex:4,-8,4|vertex:5,-7,2
```

Do not alter the comparator or rotate/reverse the cycle merely to obtain another equally valid geometric layout; stable identifiers and replay compatibility require these exact outputs.

## 9. Public topology factory

Provide a pure factory with this responsibility:

```ts
export function createStandardBoardTopology(
  portKinds: NinePortKinds,
): BoardTopology;
```

Requirements:

- no optional random source;
- no default random port order;
- no terrain or number-token input;
- no `BoardState` creation;
- no mutation of the supplied tuple or its `PortKind` objects;
- repeated calls with structurally equal input produce structurally equal JSON output;
- separate calls return independent object/array graphs rather than a shared mutable singleton;
- perform an invariant assertion before returning.

A defensive runtime length check for nine port kinds is required even though TypeScript declares a tuple, because plain JavaScript or deserialized data can cross trusted boundaries.

## 10. Invariant validation

Implement a focused pure assertion:

```ts
export function assertStandardBoardTopology(
  topology: BoardTopology,
): void;
```

It must verify all invariants stated in sections 1, 3, 6, 7, and 8, including stable IDs and reciprocal relationships.

A broken generated or persisted topology is a programmer/data invariant failure, not a player `RuleViolation`; throw an `Error` with an actionable diagnostic. Do not add these errors to the gameplay `RuleViolationCode` union.

The assertion must not mutate the topology.

Do not build a general graph framework or an elaborate new public validation-result hierarchy in this task.

# Required source layout

Use the existing `src/game/board/` directory. The following focused layout is required unless the accepted repo already has an equivalent documented convention:

```text
src/game/board/
├── coordinates.ts
├── topology-ids.ts
├── coastline.ts
├── port-slots.ts
├── standard-board-topology.ts
├── topology-invariants.ts
├── standard-board-topology.test.ts
└── topology-invariants.test.ts
```

Responsibilities:

- `coordinates.ts`: radius-two axial coordinate generation, cube conversion, ordered integer corner calculation;
- `topology-ids.ts`: exact deterministic ID helpers and stable comparator;
- `coastline.ts`: deterministic coastal cycle derivation;
- `port-slots.ts`: nine-item tuple, frozen slot indices, port attachment from supplied kinds;
- `standard-board-topology.ts`: graph construction and public factory;
- `topology-invariants.ts`: assertion only;
- tests: focused topology and corruption/invariant tests.

Do not add barrel `index.ts` files.

# Tests

Use Vitest only. Add no dependency.

Required coverage:

1. Radius-two coordinate generation returns exactly the 19 expected unique axial coordinates in frozen `q`, then `r`, order.
2. Cube conversion and every integer corner satisfy the zero-sum invariant.
3. Stable ID helpers return the exact frozen string formats.
4. Reaching a shared physical corner/edge from neighbouring tiles produces identical IDs.
5. A generated topology contains exactly 19 tiles, 54 vertices, 72 edges, and 9 ports.
6. It contains exactly 42 interior and 30 coastal edges.
7. Vertex incident-edge distribution is exactly 36×3 and 18×2.
8. Vertex adjacent-tile distribution is exactly 24×3, 12×2, and 18×1.
9. Every tile has six distinct cyclic vertices and six distinct corresponding edges.
10. All tile/vertex/edge adjacency is reciprocal, symmetric where required, duplicate-free, and references known IDs.
11. `coastal` agrees exactly with edge tile incidence.
12. The coastline derivation returns one deterministic cycle of 30 distinct edges and 30 distinct vertices.
13. The nine port slots use the frozen indices and gap pattern, are coastal and pairwise non-adjacent, and copy their edge endpoints.
14. Supplied port-kind order is preserved and the input is not mutated.
15. Two factory calls with equal input have equal JSON output but do not share returned top-level or nested mutable object/array references.
16. `JSON.stringify()` succeeds and the returned value contains no runtime `Map`, `Set`, function, or `Date` values.
17. `assertStandardBoardTopology()` accepts the generated topology.
18. Representative corruptions are rejected, including at least:
    - a missing edge reference;
    - a non-reciprocal vertex adjacency;
    - an edge with an incorrect `coastal` flag;
    - a port attached to a non-coastal or adjacent duplicate slot.
19. All accepted Task 00 and Task 01 tests continue to pass.

Do not use a giant full-object inline snapshot as the sole proof. Focused deterministic assertions are required.

# Documentation

Only these documentation changes are expected:

1. Add this task file and prompt under `tasks/`.
2. Narrowly update `docs/BOARD_MODEL.md` with:
   - the exact scaled cube-corner formula;
   - the exact stable ID formats;
   - deterministic coastline ordering;
   - frozen port slot indices/gap pattern;
   - clarification that Task 02 accepts ordered port kinds but does not create/shuffle their multiset.
3. Update the README current-status section to state that domain contracts plus deterministic standard topology are complete after all checks pass.

Do not alter the ruleset, architecture direction, game-state schema, or unrelated documents.

# Forbidden work

Do not implement or add:

- terrain distribution or terrain assignment;
- number-token distribution or red-number rules;
- desert or robber placement;
- official port-kind multiset creation or shuffling;
- `BoardState`, tile contents, occupancy initialization, or game creation;
- seeded RNG or any random operation;
- `Math.random()`, trigonometric/pixel geometry, SVG, CSS, React, or MUI;
- building, road-placement, distance, production, port-access, or Longest Road rules;
- command execution, events, selectors, `PlayerView` projection, AI, Zustand, gateway, persistence, router, backend, networking, animation, or deployment;
- a generic graph library or new npm dependency;
- changes to accepted Task 01 public contracts unless a true blocker is reported before implementation;
- a Git commit.

# Acceptance criteria

1. The exact radius-two land graph is generated algorithmically and deterministically.
2. The returned `BoardTopology` has 19 tiles, 54 vertices, 72 edges, 42 interior edges, 30 coastal edges, and 9 valid ports.
3. Stable IDs follow the exact frozen formats and do not depend on iteration or render order.
4. Shared physical corners and sides are represented once.
5. Tile cyclic tuples and every reciprocal adjacency relation are correct.
6. The coastline is one deterministic 30-edge cycle.
7. Port slots use the exact frozen indices and 3/3/4 repeating gap pattern without adjacent ports.
8. Port kinds are supplied in order, cloned, and not randomly created or shuffled.
9. The invariant assertion rejects representative corrupted structures.
10. Returned data is immutable-by-contract plain JSON data with no domain/UI contamination.
11. No accepted contract is silently changed and no out-of-scope feature is implemented.
12. No dependency is added.
13. `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, and `npm run check` all pass.
14. Completion report follows `AGENTS.md` and includes the additions below.

# Completion report additions

In addition to the normal `AGENTS.md` report, include:

- the exact generated counts for tiles, vertices, edges, interior edges, coastal edges, coastal vertices, and ports;
- the vertex degree and tile-incidence distributions;
- the deterministic coastline start vertex and first traversed edge for the accepted implementation;
- the resolved nine port edge IDs in slot order;
- confirmation of the exact ID formats;
- confirmation that no floating-point/trigonometric geometry or randomness was used;
- exact test-file/test counts and command results;
- confirmation that no Task 01 public contract was changed;
- explicit scope confirmation and confirmation that no Git commit was created.
