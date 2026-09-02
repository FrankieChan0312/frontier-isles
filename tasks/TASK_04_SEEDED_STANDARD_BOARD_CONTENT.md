# Task 04 — Deterministic Seeded Standard Board Content

## Status

Ready for Codex implementation after Task 03 is accepted and committed as a clean checkpoint.

## Objective

Implement the deterministic random foundation and the authoritative initial `BoardState` generator for the standard four-player base board.

This task creates and verifies:

- the frozen `XORSHIFT32_V1` random-state implementation;
- exact string-seed hashing into a non-zero unsigned 32-bit state;
- pure, explicit random-state threading with no hidden mutable generator;
- unbiased bounded integer sampling and immutable Fisher–Yates shuffling;
- the standard terrain, number-token, and port-kind multisets;
- deterministic assignment of 19 terrains, 18 number tokens, and 9 port kinds;
- a guaranteed non-adjacent placement of the four red number tokens (`6, 6, 8, 8`) without retry loops;
- creation of a complete initial `BoardState` with empty vertex/edge occupancy and the robber on the desert;
- comprehensive initial-board invariant validation;
- golden deterministic fixtures suitable for later TypeScript/Java parity tests.

This task does **not** create a `GameState`, players, bank resources, development-card deck, dice rolling, setup placement, game commands, rules execution, selectors, AI, stores, gateways, persistence, terrain artwork, number-token rendering, or UI changes.

## Mandatory reading

Read in this order before changing code:

1. `AGENTS.md`
2. `docs/PRODUCT_SCOPE.md`
3. `docs/GAME_RULES.md`
4. `docs/ARCHITECTURE.md`
5. `docs/BOARD_MODEL.md`
6. `docs/CODING_STANDARDS.md`
7. `docs/adr/ADR-0001-v1-architecture-baseline.md`
8. `docs/adr/ADR-0002-flat-top-raw-svg-board-rendering.md`
9. `tasks/TASK_01_DOMAIN_CONTRACTS.md`
10. `tasks/TASK_02_STANDARD_BOARD_TOPOLOGY.md`
11. `tasks/TASK_03_RESPONSIVE_SVG_BOARD_RENDERER.md`
12. This task file

Inspect the accepted Task 01 contracts and Task 02 topology implementation before writing. Reuse the exact existing `RandomState`, `BoardState`, `TileContent`, `TerrainType`, `NumberToken`, `PortKind`, `NinePortKinds`, topology factory, topology invariant validator, tile ordering, and deterministic code-unit comparator. Do not duplicate or replace them.

## Preflight

1. Run `git status --short` and report the exact result.
2. The expected starting tree is clean except for the newly supplied Task 04 files under `tasks/`.
3. Run `npm run check` before changing production source. Stop and report a blocker if the accepted Task 03 baseline fails.
4. Do not alter package versions or install dependencies.
5. Do not create a Git commit.

# Frozen random decisions

## 1. Randomness boundary

All deterministic random operations belong under `src/game/random/**` and remain pure TypeScript.

Forbidden:

- `Math.random()`;
- `crypto.randomUUID()` or random Web Crypto calls;
- wall-clock time;
- module-level mutable RNG state;
- a mutable RNG class hidden behind methods;
- browser, React, MUI, Zustand, storage, networking, or AI imports;
- converting random state to signed values in public contracts.

Every operation receives an accepted immutable `RandomState` and returns a value together with a new `RandomState`. It must not mutate the input state or input collection.

Use this exact generic result contract in the random module:

```ts
export interface RandomResult<T> {
  readonly value: T;
  readonly random: RandomState;
}
```

Provide these exact public functions:

```ts
export function createInitialRandomState(seed: string): RandomState;

export function nextRandomUint32(
  random: RandomState,
): RandomResult<number>;

export function nextRandomFloat(
  random: RandomState,
): RandomResult<number>;

export function nextRandomInt(
  random: RandomState,
  minInclusive: number,
  maxExclusive: number,
): RandomResult<number>;

export function shuffleWithRandom<T>(
  items: readonly T[],
  random: RandomState,
): RandomResult<readonly T[]>;
```

Do not add a second stateful/random API.

## 2. Exact seed-to-state algorithm

`createInitialRandomState(seed)` must reject only an empty string. Do not trim, normalize, lowercase, encode through locale rules, or otherwise modify the seed. A non-empty whitespace seed is therefore distinct and valid.

Hash the JavaScript UTF-16 code units exactly as follows:

```text
hash = 0x811C9DC5

for each UTF-16 code unit in seed, in index order:
    hash = hash XOR codeUnit
    hash = unsigned32(Math.imul(hash, 0x01000193))

if hash == 0:
    hash = 0x6D2B79F5
```

The returned state is exactly:

```ts
{
  algorithm: RANDOM_ALGORITHM_ID,
  seed,
  state: hash,
  drawCount: 0,
}
```

Use `String.prototype.charCodeAt(index)` semantics. Do not hash Unicode code points, UTF-8 bytes, JSON, or platform-default bytes.

Frozen seed-hash anchors:

```text
"FRONTIER-ISLES-TASK-04" -> 1554738384
"ABC"                    -> 1552166763
"島"                     -> 1933845321
"😀"                     -> 3409036472
```

The last anchor intentionally proves UTF-16 surrogate-code-unit semantics.

## 3. Exact XORSHIFT32 transition

For one draw, begin with the current non-zero unsigned 32-bit state `x` and execute in this exact order:

```text
x = unsigned32(x XOR unsigned32(x << 13))
x = unsigned32(x XOR (x >>> 17))
x = unsigned32(x XOR unsigned32(x << 5))
```

`nextRandomUint32` returns `x` as a JavaScript number in `[0, 4294967295]` and a fresh state with:

```text
state     = x
drawCount = previous drawCount + 1
seed      = unchanged
algorithm = unchanged
```

Use unsigned bit operations (`>>> 0`) and `Math.imul` where specified. The zero state is invalid because it would lock xorshift at zero.

For seed `FRONTIER-ISLES-TASK-04`, the first ten unsigned draws must be:

```text
387972424
4268206963
1781534743
1852458446
4238426695
1238421075
1397378462
1170840738
3185645068
2067524124
```

After those ten draws, `state` is `2067524124` and `drawCount` is `10`.

## 4. Random-state validation

Every random operation must reject an invalid programmer/configuration state with an actionable `Error` before producing a value.

A valid `RandomState` has:

- `algorithm === RANDOM_ALGORITHM_ID`;
- a non-empty string seed;
- `state` as an integer from `1` through `4294967295` inclusive;
- `drawCount` as a non-negative safe integer.

Ordinary invalid random configuration is not a player `RuleViolation` because no command engine exists in this task.

## 5. Float generation

`nextRandomFloat` consumes exactly one unsigned draw and returns:

```text
uint32 / 4294967296
```

The result must be finite and in `[0, 1)`.

## 6. Bounded integer generation

`nextRandomInt(random, minInclusive, maxExclusive)` uses a half-open interval.

Both bounds must be safe integers. Require:

```text
maxExclusive > minInclusive
1 <= span <= 4294967296
span = maxExclusive - minInclusive
```

Use rejection sampling, not `Math.floor(nextFloat * span)` and not biased modulo sampling:

```text
limit = floor(4294967296 / span) * span

do:
    draw one uint32
while draw >= limit

value = minInclusive + (draw % span)
```

The returned random state includes every consumed draw, including rejected draws.

Frozen rejection-sampling anchor:

```text
input RandomState.state = 8192
input drawCount         = 7
range                   = [0, 2147483649)
first uint32            = 2214879744  (rejected)
second uint32           = 13148770    (accepted)
returned value          = 13148770
final state             = 13148770
final drawCount         = 9
```

Use any non-empty seed string and the accepted algorithm literal in that supplied test state; the seed remains unchanged.

## 7. Immutable Fisher–Yates shuffle

`shuffleWithRandom` must:

1. validate the input random state;
2. copy the input array;
3. iterate `i` from `length - 1` down to `1`;
4. draw `j = nextRandomInt(0, i + 1)`;
5. swap copied elements `i` and `j`;
6. return the copied array and final state.

It must never mutate the input array. Length `0` or `1` returns a fresh equal array and consumes zero draws.

Frozen shuffle anchor:

```text
seed:   FRONTIER-ISLES-TASK-04
input:  ["A", "B", "C", "D", "E"]
output: ["C", "A", "B", "D", "E"]
final state: 1852458446
final drawCount: 4
```

# Frozen standard-board content decisions

## 8. Exact standard distributions

Export readonly constants with these exact source orders. Source order is part of deterministic generation because Fisher–Yates consumes it.

### Terrain source tuple

```ts
export const STANDARD_TERRAIN_DISTRIBUTION = [
  "FOREST", "FOREST", "FOREST", "FOREST",
  "HILLS", "HILLS", "HILLS",
  "PASTURE", "PASTURE", "PASTURE", "PASTURE",
  "FIELDS", "FIELDS", "FIELDS", "FIELDS",
  "MOUNTAINS", "MOUNTAINS", "MOUNTAINS",
  "DESERT",
] as const;
```

Exact counts:

```text
FOREST     4
HILLS      3
PASTURE    4
FIELDS     4
MOUNTAINS  3
DESERT     1
```

### Red number source tuple

```ts
export const STANDARD_RED_NUMBER_TOKENS = [6, 6, 8, 8] as const;
```

### Non-red number source tuple

```ts
export const STANDARD_NON_RED_NUMBER_TOKENS = [
  2,
  3, 3,
  4, 4,
  5, 5,
  9, 9,
  10, 10,
  11, 11,
  12,
] as const;
```

Together, the 18 tokens have exact counts:

```text
2×1, 3×2, 4×2, 5×2, 6×2,
8×2, 9×2, 10×2, 11×2, 12×1
```

### Port-kind source tuple

Use the accepted `NinePortKinds` type:

```ts
export const STANDARD_PORT_KIND_DISTRIBUTION: NinePortKinds = [
  { type: "GENERIC" },
  { type: "GENERIC" },
  { type: "GENERIC" },
  { type: "GENERIC" },
  { type: "RESOURCE", resource: "LUMBER" },
  { type: "RESOURCE", resource: "BRICK" },
  { type: "RESOURCE", resource: "WOOL" },
  { type: "RESOURCE", resource: "GRAIN" },
  { type: "RESOURCE", resource: "ORE" },
];
```

Exact counts:

```text
GENERIC 4
LUMBER  1
BRICK   1
WOOL    1
GRAIN   1
ORE     1
```

Do not reuse the Task 03 UI-only preview tuple as the authoritative generator distribution.

## 9. Public board-generation API

Provide exactly one public initial-board generator:

```ts
export function createStandardInitialBoard(
  random: RandomState,
): RandomResult<BoardState>;
```

The caller is responsible for first calling `createInitialRandomState(seed)`. Do not add a second convenience `fromSeed` API in this task.

The function must:

- validate its random state;
- never mutate the input state or any frozen distribution;
- return a complete fresh `BoardState` matching the accepted contract;
- return the post-generation `RandomState` in `RandomResult.random`;
- remain independent of React, SVG, MUI, stores, storage, and AI.

## 10. Exact generation order

Generation order is frozen because it determines seed reproducibility.

Starting from the supplied `RandomState`, perform these operations in this exact order:

1. Shuffle `STANDARD_PORT_KIND_DISTRIBUTION`.
2. Pass that nine-kind order directly to accepted `createStandardBoardTopology(...)` and use the resulting topology for the rest of generation.
3. Obtain topology tiles in explicit ascending `(q, r)` order.
4. Shuffle `STANDARD_TERRAIN_DISTRIBUTION`.
5. Assign shuffled terrains one-to-one to the sorted tiles.
6. Identify the one desert tile and collect the other 18 tile IDs in the same ascending `(q, r)` order.
7. Shuffle the 18 non-desert tile IDs to create the candidate order for red-number placement.
8. Select the first valid four-tile independent set from that candidate order using the exact deterministic search below.
9. Shuffle `STANDARD_RED_NUMBER_TOKENS` and assign them to the four selected tile IDs in selected order.
10. Shuffle `STANDARD_NON_RED_NUMBER_TOKENS`.
11. From the original ascending non-desert tile order, remove the four red tile IDs while preserving the remaining order.
12. Assign shuffled non-red tokens one-to-one to those 14 remaining tile IDs.
13. Build all `TileContent` records, all-null vertex/edge occupancy records, the desert robber position, and the final `BoardState`.
14. Validate the result with the Task 04 initial-board invariant validator before returning it.

Do not change the draw order, combine the token arrays before shuffling, sort after a shuffle, or consume decorative/random extra draws.

## 11. Guaranteed red-number placement

A red-number tile is any tile whose number token is `6` or `8`.

Two land tiles are adjacent exactly when one accepted topology edge has both tile IDs in its `tileIds` tuple/list. Do not infer adjacency from SVG positions or parse branded IDs.

Use this exact deterministic depth-first combination search over the shuffled candidate tile IDs:

```text
search(startIndex, selected):
    if selected.length == 4:
        return selected

    for i from startIndex through candidateIds.length - 1:
        candidate = candidateIds[i]

        if candidate is adjacent to any selected tile:
            continue

        append candidate
        result = search(i + 1, selected)
        if result exists:
            return result
        remove candidate

    return no result
```

Return the first valid set found. Preserve selection order; do not sort the selected set before assigning the shuffled red tokens.

This is a finite constructive search. Do not repeatedly reshuffle until a valid board happens to appear, and do not use an unbounded retry loop.

Failure to find four pairwise non-adjacent non-desert tiles is an invariant/programmer error and must throw an actionable `Error`.

## 12. Initial `BoardState` construction

Use the accepted Task 01 contract without adding or renaming fields.

Required values:

- `generatorVersion` is the accepted `BOARD_GENERATOR_VERSION` literal;
- `topology` is the accepted standard topology containing the shuffled port kinds;
- every one of the 19 topology tile IDs has exactly one `TileContent`;
- the desert has `numberToken: null`;
- every non-desert tile has exactly one valid `NumberToken`;
- `vertexOccupancy` has exactly all 54 topology vertex IDs, each set to `null`;
- `edgeOccupancy` has exactly all 72 topology edge IDs, each set to `null`;
- `robberTileId` equals the desert tile ID.

Do not add roads, buildings, resource production, port ownership, legal actions, scores, UI geometry, or cached adjacency.

All returned objects and arrays must be plain JSON-compatible values. Temporary local `Map`/`Set` values are allowed but must not escape.

## 13. Initial-board invariant validator

Provide:

```ts
export function assertStandardInitialBoard(
  board: BoardState,
): void;
```

It must not mutate its input. It must throw an actionable `Error` on the first detected invariant failure.

At minimum validate:

1. accepted generator version;
2. accepted standard topology invariants;
3. exact and complete tile-content keys, with no unknown/missing tile;
4. exact terrain counts;
5. exactly one desert;
6. desert has `numberToken === null`;
7. every non-desert has a valid non-null number token;
8. exact complete number-token multiset;
9. exactly four red-number tiles;
10. no topology edge joins two red-number tiles;
11. exact port-kind multiset: four generic and one of each resource;
12. exact and complete vertex-occupancy keys, all `null`;
13. exact and complete edge-occupancy keys, all `null`;
14. robber tile exists and is exactly the desert tile;
15. public data remains plain JSON-compatible.

The validator is specifically for a newly generated initial standard board. It is not a validator for a board after roads/buildings have been placed.

# Golden Task 04 board fixture

The following output is frozen for later engine and Java parity tests.

Input:

```text
seed = FRONTIER-ISLES-TASK-04
```

Initial random state:

```text
state     = 1554738384
drawCount = 0
```

After complete board generation:

```text
state     = 2871825349
drawCount = 59
```

No rejection draw occurs for this fixture.

## Port kinds in accepted slot order

```text
0 RESOURCE ORE
1 RESOURCE LUMBER
2 RESOURCE BRICK
3 RESOURCE GRAIN
4 GENERIC
5 RESOURCE WOOL
6 GENERIC
7 GENERIC
8 GENERIC
```

## Tile contents in ascending `(q, r)` order

```text
tile:-2,0   MOUNTAINS  11
tile:-2,1   FIELDS      6
tile:-2,2   PASTURE     3
tile:-1,-1  FOREST      8
tile:-1,0   FIELDS     11
tile:-1,1   FOREST     10
tile:-1,2   FOREST      2
tile:0,-2   PASTURE     3
tile:0,-1   PASTURE     5
tile:0,0    DESERT      null
tile:0,1    HILLS       4
tile:0,2    FIELDS      5
tile:1,-2   FIELDS      6
tile:1,-1   HILLS       4
tile:1,0    MOUNTAINS  10
tile:1,1    PASTURE     9
tile:2,-2   FOREST     12
tile:2,-1   HILLS       8
tile:2,0    MOUNTAINS   9
```

Selected red-number tile IDs, before red-token assignment, are exactly:

```text
tile:2,-1
tile:-2,1
tile:1,-2
tile:-1,-1
```

The shuffled red values assigned in that order are:

```text
8, 6, 6, 8
```

The golden fixture must be asserted from a compact, independently written snapshot of sorted port/tile records. Do not use one giant serialized topology snapshot as the sole proof.

# Required source layout

Use this focused layout unless the accepted repository already has an equivalent documented convention:

```text
src/game/random/
├── seeded-random.ts
└── seeded-random.test.ts

src/game/board/
├── standard-board-content.ts
├── standard-board-content.test.ts
├── initial-board-invariants.ts
└── initial-board-invariants.test.ts
```

Responsibilities:

- `seeded-random.ts`: exact seed hash, XORSHIFT32 transition, validation, floats, bounded integers, and immutable shuffle;
- `standard-board-content.ts`: frozen distributions, exact generation sequence, deterministic red placement, and initial `BoardState` creation;
- `initial-board-invariants.ts`: initial standard-board assertions only;
- tests: focused random, generation, golden-fixture, corruption, immutability, and regression tests.

Do not add barrel `index.ts` files.

# Required tests

Use existing Vitest only. Add no dependency.

## Random tests

1. Exact four seed-hash anchors, including `島` and `😀`.
2. Empty seed rejected; non-empty seed preserved exactly.
3. Exact first ten uint32 draws and final state/count for the golden seed.
4. Each random call returns a fresh state and does not mutate the input.
5. Float values are finite and in `[0,1)` and consume one draw.
6. Integer half-open bounds and invalid-bound validation.
7. A controlled state/range case proves rejection draws are counted; do not mock `Math.random`.
8. Exact five-item shuffle anchor.
9. Empty/one-item shuffles return fresh arrays and consume zero draws.
10. Shuffle preserves duplicates/multisets and does not mutate its input.
11. Invalid algorithm, zero/out-of-range state, invalid draw count, or empty seed in a supplied `RandomState` is rejected.
12. No production source contains or calls `Math.random()`.

## Board-generation tests

13. Exact exported distribution source orders and counts.
14. Generated board contains 19 tile contents, 54 null vertex occupancies, 72 null edge occupancies, and 9 ports.
15. Exact terrain, number-token, and port-kind multisets.
16. Desert has no number and owns the robber; every non-desert has a number.
17. Four red tokens exist and no accepted interior edge joins two red tiles.
18. Equal starting random states produce structurally equal JSON output and equal final random states, but independent object/array graphs.
19. Input `RandomState`, topology helpers, and frozen source distributions are not mutated.
20. At least two frozen different seeds produce different board-content snapshots while each passes invariants.
21. Generation result is plain JSON serializable.
22. The complete golden fixture above matches exactly, including final state/count, port order, tile contents, selected red slots, and red assignment. If selected slots are kept internal, prove the same order through a focused test seam or a narrowly scoped pure helper rather than exposing UI/game-state fields.
23. A deterministic seed corpus including `TASK04-DESERT-0` through `TASK04-DESERT-54` produces valid boards and collectively covers all 19 possible desert coordinates.
24. Repeated invariant validation accepts valid boards and does not mutate them.
25. Corruption tests reject at least: missing tile content, wrong terrain count, desert with a number, non-desert without a number, wrong token multiset, adjacent red numbers, wrong port multiset, missing/non-null occupancy, and robber not on desert.
26. All accepted Task 00–03 tests continue to pass.

Do not make a giant full-`BoardState` snapshot the sole test. Use focused assertions and compact sorted snapshots.

# Documentation

Expected documentation work:

1. Add this task file and its prompt under `tasks/`.
2. Narrowly update `docs/BOARD_MODEL.md` with:
   - exact terrain/number/port distributions;
   - the distinction between topology and generated content;
   - the red-number non-adjacency guarantee;
   - desert/robber and empty-occupancy initial state;
   - the exact frozen generation order.
3. Narrowly update `docs/ARCHITECTURE.md` with:
   - explicit immutable `RandomState` threading;
   - the exact seed-hash and XORSHIFT32 boundary;
   - no hidden random singleton and no `Math.random()`;
   - future TypeScript/Java deterministic parity intent.
4. Add `docs/adr/ADR-0003-deterministic-seeded-board-generation.md` recording:
   - XORSHIFT32 and UTF-16 code-unit seed hashing;
   - rejection sampling and Fisher–Yates;
   - port-first frozen draw order;
   - constructive red-number placement rather than retry generation;
   - generated content remains outside the UI renderer.
5. Update the README current-status section only after all checks pass.

Do not rewrite unrelated game rules, AI documents, UI rendering decisions, or accepted contracts.

# Forbidden work

Do not implement or add:

- changes to accepted Task 01 public contracts;
- changes to accepted Task 02 topology behaviour or frozen port slots;
- changes to accepted Task 03 SVG projection, preview, or landing page;
- a new random algorithm/version identifier;
- seed normalization, locale-sensitive comparisons, UUIDs, cryptographic randomness, wall-clock entropy, or `Math.random()`;
- a mutable/global RNG service;
- unbounded board-regeneration/retry loops;
- a `GameState` or `createGame` orchestration;
- player order randomization, players, bank resource inventory, development deck generation/shuffling, dice rolling, resource production, build costs, setup placement, command execution, rules, selectors, PlayerView, AI, Zustand, gateway, persistence, routing, backend, networking, UI terrain rendering, number-token rendering, robber artwork, animation, audio, or deployment;
- new npm dependencies;
- official CATAN logos, artwork, card images, or copied rulebook text;
- generic graph/random frameworks or barrel files;
- a Git commit.

# Acceptance criteria

1. `XORSHIFT32_V1` matches every frozen seed/draw anchor exactly.
2. All randomness is explicit, immutable, serializable, and free from hidden/global entropy.
3. Bounded integers use rejection sampling and shuffling is immutable Fisher–Yates.
4. Standard terrain, number, and port distributions match the frozen multisets and source orders.
5. Equal seeds and input states reproduce equal complete initial boards and final random states.
6. Four red tokens are always placed on pairwise non-adjacent non-desert tiles without retry loops.
7. The complete `BoardState` has accepted topology, all contents, empty occupancy, and robber on desert.
8. Initial-board invariants reject representative corruptions without mutating valid input.
9. The golden Task 04 fixture matches exactly.
10. No accepted contract/topology/UI behaviour or dependency changes.
11. No game orchestration, rules, AI, stores, backend, or UI content rendering is introduced.
12. `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, and `npm run check` all pass.
13. `git diff --check` passes apart from already-known line-ending notices.
14. Completion report follows `AGENTS.md` and includes the additions below.

# Completion report additions

In addition to the normal `AGENTS.md` report, include:

- exact files created/changed;
- exact public random and board-generation APIs;
- exact seed-hash/XORSHIFT32/rejection/Fisher–Yates decisions;
- exact distribution counts and generation order;
- golden seed initial/final random states and draw count;
- golden port order, desert tile, red tile order, and 19 tile contents;
- test-file/test totals and exact command results;
- confirmation that no `Math.random()`, hidden mutable RNG, retry generation, or branded-ID geometry parsing was used;
- confirmation that Task 01 contracts, Task 02 topology, Task 03 UI, and dependencies were unchanged;
- explicit scope confirmation;
- confirmation that no Git commit was created.
