# Task 03 — Responsive Raw-SVG Standard Board Renderer

## Status

Ready for Codex implementation after Task 02 is accepted, the handoff-only `tasks/README.txt` is removed if present, and the Task 02 baseline is committed as a clean checkpoint.

## Objective

Implement the first visual board vertical slice: a deterministic, responsive, accessible raw-SVG renderer for the accepted standard-board topology.

This task creates and verifies:

- a pure UI-layer projection from the accepted axial/scaled-cube topology geometry into SVG coordinates;
- one frozen **flat-top** board orientation;
- deterministic layout records for all 19 tiles, 54 vertices, 72 edges, and 9 ports;
- a responsive `<svg>` using one computed `viewBox`;
- neutral land tiles with no terrain semantics;
- visible generic/resource port markers using the accepted `PortKind` contract;
- an optional topology debug overlay for vertices, edges, and coordinate labels;
- an accessible board title and description;
- integration of a static board preview into the existing Task 00 landing screen;
- focused geometry, rendering, accessibility, and regression tests.

This task does **not** create terrain assignment, number tokens, desert/robber state, board occupancy, building/road pieces, legal-action highlights, interaction commands, game rules, game creation, RNG, AI, stores, persistence, or networking.

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
9. `tasks/TASK_02_STANDARD_BOARD_TOPOLOGY.md`
10. This task file

Inspect the accepted Task 01 contracts and Task 02 topology implementation before writing. Reuse the existing `BoardTopology`, branded IDs, `PortKind`, standard topology factory, integer-corner helper, and stable comparator. Do not duplicate or replace them.

## Preflight

1. Run `git status --short` and report the exact result.
2. The expected starting tree is clean except for the newly supplied Task 03 files under `tasks/`.
3. If `tasks/README.txt` is only the copied handoff note from an earlier ZIP, remove it before the checkpoint/task rather than treating it as project documentation.
4. Run `npm run check` before changing production source. Stop and report a blocker if the accepted Task 02 baseline fails.
5. Do not alter package versions or install dependencies.
6. Do not create a Git commit.

# Frozen rendering decisions

## 1. Rendering boundary

All SVG projection and rendering code belongs under `src/ui/board/**`.

The accepted domain/topology layer remains renderer-independent:

```text
src/game/** must not contain:
- SVG x/y positions
- viewBox values
- polygon point strings
- CSS or MUI values
- viewport dimensions
- pointer/hover state
```

The UI layer may import accepted pure contracts and topology helpers from `src/game/**`. The reverse dependency is forbidden.

Do not modify any accepted Task 01 public contract or Task 02 topology output merely to make rendering easier. In particular, do not add pixel coordinates to `VertexDefinition` or `TileDefinition`.

## 2. Board orientation

The V1 board renderer uses a **flat-top hex orientation**.

For a tile axial coordinate `(q, r)` and hex circumradius `s`:

```text
tileCenterX = 3/2 × s × q
tileCenterY = √3 × s × (r + q/2)
```

Task 02 converts axial coordinates to cube coordinates as:

```text
cubeX = q
cubeY = -q - r
cubeZ = r
```

Task 02 integer corner coordinates are scaled by 3. For an accepted integer corner `(x, y, z)`, project it without parsing any ID:

```text
vertexX = s × x / 2
vertexY = √3 × s × (x + 2z) / 6
```

`y` is intentionally not required by the 2D projection, but its zero-sum invariant remains part of the accepted topology geometry.

Use one module constant for `√3`, calculated as `Math.sqrt(3)`. UI projection may use finite floating-point coordinates. The Task 02 prohibition on floating-point topology deduplication still stands.

Do not use `Math.sin`, `Math.cos`, manually rounded ID geometry, or SVG pixel coordinates as domain identity.

## 3. Do not parse topology IDs

Branded topology IDs are stable identifiers, not a rendering data format.

The renderer must not extract coordinates by splitting strings such as:

```text
vertex:-1,-7,8
```

Instead, derive every vertex screen point by iterating the accepted tile definitions in deterministic order:

1. read a tile's axial coordinate;
2. calculate its six accepted integer corner coordinates with the existing Task 02 helper;
3. pair corner index `i` with `tile.vertexIds[i]`;
4. project the integer corner with the frozen formula;
5. assert that repeated encounters with the same `VertexId` produce the same finite point.

Edges then use the projected points belonging to their accepted endpoint IDs.

This preserves ID opacity and proves that rendering follows the accepted cyclic topology.

## 4. Default layout constants

Export these exact UI-layer constants:

```ts
export const DEFAULT_HEX_SIZE = 64;
export const DEFAULT_PORT_OFFSET = 38;
export const DEFAULT_PORT_MARKER_WIDTH = 58;
export const DEFAULT_PORT_MARKER_HEIGHT = 28;
export const DEFAULT_BOARD_PADDING = 24;
```

All values are SVG user units, not CSS pixels stored in game state.

A public layout factory may accept optional overrides through one readonly options object, but:

- every omitted value uses the constants above;
- every supplied value must be finite and greater than zero;
- invalid options throw an actionable `Error` because they are programmer/configuration failures, not player rule violations.

Do not add responsive breakpoints to the geometry itself. Responsiveness comes from the SVG `viewBox` and its container.

## 5. UI layout contracts

Create focused readonly UI-layer types equivalent to the following responsibilities. Exact naming may follow the accepted repository style, but do not create a generic geometry framework.

```ts
export interface SvgPoint {
  readonly x: number;
  readonly y: number;
}

export interface SvgViewBox {
  readonly minX: number;
  readonly minY: number;
  readonly width: number;
  readonly height: number;
}

export interface TileSvgLayout {
  readonly tileId: TileId;
  readonly center: SvgPoint;
  readonly points: readonly [
    SvgPoint, SvgPoint, SvgPoint,
    SvgPoint, SvgPoint, SvgPoint,
  ];
  readonly pointString: string;
}

export interface VertexSvgLayout {
  readonly vertexId: VertexId;
  readonly point: SvgPoint;
}

export interface EdgeSvgLayout {
  readonly edgeId: EdgeId;
  readonly from: SvgPoint;
  readonly to: SvgPoint;
  readonly midpoint: SvgPoint;
  readonly coastal: boolean;
}

export interface PortSvgLayout {
  readonly portId: PortId;
  readonly edgeId: EdgeId;
  readonly edgeMidpoint: SvgPoint;
  readonly markerCenter: SvgPoint;
  readonly markerWidth: number;
  readonly markerHeight: number;
  readonly kind: PortKind;
  readonly label: string;
  readonly accessibleLabel: string;
}

export interface BoardSvgLayout {
  readonly viewBox: SvgViewBox;
  readonly aspectRatio: number;
  readonly tiles: readonly TileSvgLayout[];
  readonly vertices: readonly VertexSvgLayout[];
  readonly edges: readonly EdgeSvgLayout[];
  readonly ports: readonly PortSvgLayout[];
}
```

The public layout result must contain fresh plain objects/arrays/numbers/strings/booleans only. Temporary `Map`/`Set` instances are allowed during derivation but must not escape.

Provide one pure factory:

```ts
export function createBoardSvgLayout(
  topology: BoardTopology,
  options?: BoardSvgLayoutOptions,
): BoardSvgLayout;
```

The factory must not mutate the topology or options.

## 6. Deterministic ordering

Do not rely on `Object.values()` insertion order as the semantic rendering order.

Use explicit deterministic ordering:

- tiles: ascending `q`, then ascending `r`;
- vertices: accepted deterministic code-unit ID comparator;
- edges: accepted deterministic code-unit ID comparator;
- ports: accepted deterministic code-unit ID comparator.

Do not use `localeCompare`.

Separate calls with equal topology/options must produce structurally equal JSON output and independent returned object/array graphs.

## 7. Tile geometry

Each tile polygon must use its accepted six cyclic vertex IDs in their stored order.

Requirements:

- exactly six finite points per tile;
- no duplicate point within one tile;
- every side length is equal to the configured hex size within a small test tolerance;
- neighbouring tiles map shared `VertexId` values to identical screen coordinates;
- the standard board presents five flat-top columns containing `3, 4, 5, 4, 3` tile centres from left to right;
- `pointString` is derived from the six points and is used only by SVG rendering.

Do not round geometry before rendering. Tests may compare with an explicit tolerance.

## 8. Port layout

For each accepted port:

1. obtain its coastal edge layout;
2. calculate the edge midpoint;
3. calculate the board centroid from the 19 tile centres;
4. create an outward vector from the centroid to the edge midpoint;
5. normalize it;
6. place the marker centre at:

```text
edgeMidpoint + outwardUnitVector × portOffset
```

The outward vector must be finite and non-zero. A port attached to an unknown/non-coastal edge is an invariant failure and must throw an actionable `Error`.

Every marker uses the frozen width/height. The computed `viewBox` must include all tile points plus every complete port marker rectangle and `DEFAULT_BOARD_PADDING`, so no port is clipped.

Port labels are UI text only:

```text
GENERIC                  -> "3:1"
RESOURCE + LUMBER        -> "LUM 2:1"
RESOURCE + BRICK         -> "BRK 2:1"
RESOURCE + WOOL          -> "WOL 2:1"
RESOURCE + GRAIN         -> "GRN 2:1"
RESOURCE + ORE           -> "ORE 2:1"
```

Accessible labels:

```text
GENERIC                  -> "Generic port, trade three for one"
RESOURCE + LUMBER        -> "Lumber port, trade two lumber for one"
RESOURCE + BRICK         -> "Brick port, trade two brick for one"
RESOURCE + WOOL          -> "Wool port, trade two wool for one"
RESOURCE + GRAIN         -> "Grain port, trade two grain for one"
RESOURCE + ORE           -> "Ore port, trade two ore for one"
```

Implement formatting with exhaustive handling of the accepted discriminated unions. Do not place localized prose in the game/domain layer.

## 9. Computed viewBox

Compute bounds from actual layout geometry; do not hard-code a final board width/height.

Bounds must include:

- every tile vertex point;
- every port marker rectangle using half width/height around its marker centre;
- board padding on all four sides.

Return:

```text
width  > 0
height > 0
aspectRatio = width / height
```

All values must be finite.

The SVG may use a negative `minX`/`minY`. Do not translate geometry merely to force the origin to zero.

## 10. Raw SVG component

Create a reusable React component with a public shape equivalent to:

```ts
export interface GameBoardProps {
  readonly topology: BoardTopology;
  readonly title?: string;
  readonly description?: string;
  readonly showDebugOverlay?: boolean;
}
```

Use defaults equivalent to:

```text
title: "Frontier Isles board"
description: "A standard nineteen-tile island board with nine coastal ports."
showDebugOverlay: false
```

Requirements:

- use a raw `<svg>`; do not add an SVG/canvas/game-engine dependency;
- use the layout factory as the only source of screen geometry;
- set `viewBox` from the computed layout;
- set `preserveAspectRatio="xMidYMid meet"`;
- size responsively inside a wrapper whose aspect ratio comes from the layout;
- use React `useId()` for unique `<title>`/`<desc>` IDs;
- expose `role="img"` and `aria-labelledby` on the SVG;
- render one ocean/background rectangle;
- render 19 neutral land polygons;
- render nine port connectors and markers;
- use stable domain IDs as React keys and `data-*` attributes;
- use the existing MUI theme for presentation, without adding custom palette module augmentation;
- do not add click, hover, keyboard, drag, pan, or zoom behaviour in this task;
- do not display terrain, number tokens, roads, buildings, robber, resources, or VP.

The neutral land polygons must not imply any terrain/resource assignment. A subtle non-semantic alternating surface treatment based on tile coordinates is allowed only if it is explicitly named as visual styling and not represented in game data.

## 11. SVG layers

Use this exact logical draw order:

1. ocean/background;
2. neutral tile polygons;
3. port connector lines and markers;
4. optional debug edge layer;
5. optional debug vertex layer;
6. optional debug tile-coordinate labels;
7. accessible `<title>` and `<desc>` metadata may be placed first in markup as required by accessibility conventions.

Each entity layer must use a stable `data-layer` value so tests can distinguish debug edges from port connector lines.

Recommended values:

```text
background
tiles
ports
 debug-edges
debug-vertices
debug-labels
```

Do not introduce empty future Road/Building/Robber components.

## 12. Debug overlay

When `showDebugOverlay` is `false` or omitted:

- no graph-edge debug lines;
- no vertex debug circles;
- no tile-coordinate debug text.

When `true`:

- render exactly 72 debug edge lines;
- render exactly 54 vertex circles;
- render exactly 19 tile coordinate labels in `(q,r)` form;
- set the debug groups to `pointer-events: none`;
- keep debug styling visually subordinate to the board.

Port connector lines do not count as graph-edge debug lines.

## 13. Static preview fixture

Task 03 needs a deterministic preview topology for the landing page, but it must not pretend to be the future seeded board-content generator.

Create a UI-only readonly `NinePortKinds` tuple containing the standard multiset in this fixed preview order:

```ts
[
  { type: "GENERIC" },
  { type: "RESOURCE", resource: "LUMBER" },
  { type: "GENERIC" },
  { type: "RESOURCE", resource: "BRICK" },
  { type: "GENERIC" },
  { type: "RESOURCE", resource: "WOOL" },
  { type: "GENERIC" },
  { type: "RESOURCE", resource: "GRAIN" },
  { type: "RESOURCE", resource: "ORE" },
]
```

Use it to call the accepted `createStandardBoardTopology()` factory at the UI preview boundary.

Rules:

- name it clearly as a preview/demo fixture;
- do not export it from `src/game/**`;
- do not shuffle it;
- do not consume RNG;
- do not create `BoardState`;
- do not claim this fixed order is the authoritative game-generation order.

## 14. Landing-screen integration

Narrowly update the existing Task 00 app to display the board preview.

Requirements:

- preserve the existing required heading, subtitle/readiness copy, and disabled `New Game — Not implemented` button;
- add a responsive MUI `Paper`/layout region containing `GameBoard`;
- keep the board usable at narrow and wide container widths through SVG scaling;
- do not add routing, stores, game controls, state transitions, or new dependencies;
- do not replace the central theme or remove Roboto.

# Required source layout

Use this focused layout unless the accepted repository already has an equivalent documented convention:

```text
src/ui/board/
├── board-layout.ts
├── board-layout.test.ts
├── port-label.ts
├── port-label.test.ts
├── HexTile.tsx
├── PortLayer.tsx
├── BoardDebugLayer.tsx
├── GameBoard.tsx
├── GameBoard.test.tsx
└── standard-board-preview.ts
```

Responsibilities:

- `board-layout.ts`: pure topology-to-SVG projection, port placement, bounds, and UI layout contracts;
- `port-label.ts`: exhaustive visual/accessibility labels for `PortKind`;
- `HexTile.tsx`: one neutral polygon; no domain decisions;
- `PortLayer.tsx`: connector/marker rendering from `PortSvgLayout` only;
- `BoardDebugLayer.tsx`: optional debug entities only;
- `GameBoard.tsx`: responsive accessible SVG composition;
- `standard-board-preview.ts`: UI-only deterministic preview tuple/topology;
- tests: focused pure-geometry and React rendering tests.

Do not add barrel `index.ts` files.

# Tests

Use existing Vitest and Testing Library only. Add no dependency.

Required coverage:

1. Flat-top projection maps tile `(0,0)` to centre `(0,0)`.
2. With hex size `s`, integer corner `(2,-1,-1)` maps exactly to `(s,0)` within floating tolerance.
3. Integer corner `(1,1,-2)` maps to `(s/2,-√3s/2)` within floating tolerance.
4. Layout returns exactly 19 tiles, 54 vertices, 72 edges, and 9 ports.
5. Tiles are explicitly ordered by `q`, then `r`; vertices/edges/ports use deterministic code-unit ID order.
6. Every tile has six distinct finite points and six side lengths equal to the configured hex size within tolerance.
7. Shared accepted `VertexId` values have one identical projected point across all incident tiles.
8. Tile-centre columns contain `3,4,5,4,3` tiles from left to right.
9. Every edge endpoint/midpoint agrees with the projected vertex records.
10. Every port marker is placed outward from the board centroid relative to its coastal edge midpoint.
11. All generic/resource visual labels and accessible labels match the frozen text exactly.
12. The computed viewBox is finite, positive, includes every tile point and complete port marker rectangle, and applies padding.
13. Invalid non-finite/non-positive layout options are rejected without mutating input.
14. A missing vertex mapping, unknown port edge, or non-coastal port edge is rejected with an actionable invariant error.
15. Repeated equal calls return structurally equal JSON output but independent arrays/objects; input topology/options are not mutated.
16. The default `GameBoard` renders one accessible SVG image with its title and description.
17. It renders exactly 19 tile polygons and 9 port marker groups with stable `data-*` IDs.
18. The preview has exactly four `3:1` labels and five resource `2:1` labels.
19. Debug overlay off renders zero debug edges/vertices/coordinate labels.
20. Debug overlay on renders exactly 72 debug edges, 54 debug vertices, and 19 coordinate labels.
21. The landing-screen smoke test continues to verify all accepted Task 00 content and now also verifies the board preview.
22. All accepted Task 01 and Task 02 tests continue to pass.

Do not use a giant full-DOM or full-layout snapshot as the sole proof. Use focused assertions.

# Documentation

Expected documentation work:

1. Add this task file and its prompt under `tasks/`.
2. Narrowly update `docs/BOARD_MODEL.md` with:
   - the chosen flat-top orientation;
   - the exact axial and scaled-cube-to-SVG projection formulas;
   - the rule that IDs are not parsed for geometry;
   - computed port placement and `viewBox` boundaries;
   - the static/non-interactive scope of Task 03.
3. Add `docs/adr/ADR-0002-flat-top-raw-svg-board-rendering.md` recording:
   - raw SVG rather than Canvas/WebGL/UI boxes;
   - flat-top orientation;
   - projection remains outside `src/game/**`;
   - one computed responsive `viewBox`;
   - no interaction or terrain semantics in Task 03.
4. Update the README current-status section after checks pass.

Do not rewrite unrelated rules, contracts, AI documents, or architecture direction.

# Forbidden work

Do not implement or add:

- changes to accepted Task 01 contracts or Task 02 topology behaviour;
- coordinate parsing from branded ID strings;
- terrain/resource assignment or terrain artwork;
- number tokens, desert, robber, `BoardState`, occupancy, roads, buildings, or game pieces;
- board-generation randomness, port shuffling, seeded RNG behaviour, dice, or `Math.random()`;
- legal-action highlights, click targets, event handlers, hover state, selection, drag, zoom, or pan;
- command execution, game engine, setup state machine, rules, selectors, `PlayerView` projection, AI, Zustand, gateway, persistence, routing, backend, networking, animation, audio, or deployment;
- official CATAN logos, artwork, text, or card imagery;
- Canvas, WebGL, Phaser, PixiJS, Three.js, an SVG library, an icon dependency, or any new npm dependency;
- a generic geometry framework or barrel files;
- a Git commit.

# Acceptance criteria

1. The accepted 19/54/72/9 topology is projected through the frozen flat-top formulas without changing domain contracts.
2. Rendering geometry is deterministic, finite, non-mutating, and independent of object insertion order.
3. Shared vertices/edges align exactly and every tile is a regular hexagon of the configured size.
4. Ports are positioned outward and the computed padded viewBox prevents clipping.
5. `GameBoard` is a responsive, accessible raw-SVG component with 19 neutral tiles and 9 visible ports.
6. Debug overlays show exactly the full accepted graph only when requested.
7. The landing page retains Task 00 behaviour and displays the new board preview.
8. No terrain, game state, interaction, rules, AI, store, backend, or other future feature is introduced.
9. No dependency or accepted game/topology contract is changed.
10. `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, and `npm run check` all pass.
11. `git diff --check` passes apart from already-known line-ending notices.
12. Completion report follows `AGENTS.md` and includes the additions below.

# Completion report additions

In addition to the normal `AGENTS.md` report, include:

- exact files created/changed;
- confirmation of flat-top orientation and the exact two projection formulas;
- the exported default layout constants and their exact values;
- exact layout counts for tiles, vertices, edges, and ports;
- the computed default viewBox and aspect ratio for the accepted preview topology;
- confirmation that branded IDs were not parsed for geometry;
- confirmation that all screen geometry remains outside `src/game/**`;
- exact test-file/test counts and command results;
- confirmation that no dependency, Task 01 contract, or Task 02 topology behaviour changed;
- explicit scope confirmation;
- confirmation that no Git commit was created.
