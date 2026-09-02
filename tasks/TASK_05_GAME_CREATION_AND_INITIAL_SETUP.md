# Task 05 — Deterministic Game Creation and Initial Setup State Machine

## Status

Ready for Codex implementation after Task 04 is accepted and committed as a clean checkpoint.

## Objective

Implement the first authoritative `GameState` creation flow and the complete four-player snake-order initial placement state machine.

This task creates and verifies:

- runtime validation of the frozen four-player `GameConfig`;
- the standard 19-card-per-resource bank inventory;
- the exact 25-card standard development deck and deterministic card identifiers;
- seeded selection of the first player while preserving clockwise seating order;
- deterministic development-deck shuffling after board generation and first-player selection;
- complete `createGame(config, seed)` construction of an authoritative setup-phase `GameState`;
- legal initial settlement placement with the distance rule and finite piece supply;
- immediate starting-resource grants when each second settlement is placed;
- legal initial road placement adjacent to the just-placed settlement;
- exact `A, B, C, D, D, C, B, A` snake progression;
- transition from setup into normal turn 1 at `ROLL_REQUIRED`;
- setup-only command execution through the accepted `CommandEnvelope`, `EngineResult`, `RuleViolation`, and `GameEvent` contracts;
- deterministic golden creation and full 16-command setup replay fixtures.

This task does **not** implement normal-turn dice rolling, normal production, paid building, development-card purchase or play, robber resolution, domestic or maritime trade, awards, scoring, victory, `PlayerView` selectors, AI, Zustand, gateways, persistence, or UI changes.

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
9. `docs/adr/ADR-0003-deterministic-seeded-board-generation.md`
10. `tasks/TASK_01_DOMAIN_CONTRACTS.md`
11. `tasks/TASK_02_STANDARD_BOARD_TOPOLOGY.md`
12. `tasks/TASK_03_RESPONSIVE_SVG_BOARD_RENDERER.md`
13. `tasks/TASK_04_SEEDED_STANDARD_BOARD_CONTENT.md`
14. This task file

Inspect and reuse the accepted Task 01 contracts, Task 02 graph, and Task 04 RNG/board APIs exactly. Do not duplicate, rename, or silently widen accepted public contracts.

## Preflight

1. Run `git status --short` and report the exact result.
2. The expected starting tree is clean except for the newly supplied Task 05 files under `tasks/`.
3. Run `npm run check` before changing production source. Stop and report a blocker if the accepted Task 04 baseline fails.
4. Do not alter package versions or install dependencies.
5. Do not create a Git commit.

# Frozen game-creation decisions

## 1. Public APIs

Provide this exact pure game-creation API:

```ts
export function createGame(
  config: GameConfig,
  seed: string,
): GameState;
```

Provide a setup-only command boundary rather than prematurely implementing the complete future game command router:

```ts
export type InitialSetupCommand = Extract<
  GameCommand,
  | { readonly type: "PLACE_INITIAL_SETTLEMENT" }
  | { readonly type: "PLACE_INITIAL_ROAD" }
>;

export type InitialSetupCommandEnvelope = Omit<
  CommandEnvelope,
  "command"
> & {
  readonly command: InitialSetupCommand;
};

export function executeInitialSetupCommand(
  state: GameState,
  envelope: InitialSetupCommandEnvelope,
): EngineResult;
```

Equivalent TypeScript syntax is permitted only if the exported semantics and narrow setup-command type are identical.

Do **not** introduce a class, service locator, mutable engine singleton, generic reducer framework, or complete `execute(GameCommand)` router in this task. A later task will compose setup handling into the complete command engine.

## 2. Runtime `GameConfig` validation

Although Task 01 uses an exact four-item tuple at compile time, `createGame` must defensively validate deserialized/runtime values.

Require:

- `config.gameId` is a string whose `trim()` is non-empty; preserve the original value;
- `config.rulesetId === RULESET_ID`;
- exactly four player configs;
- every player ID is a string whose `trim()` is non-empty;
- all four player IDs are unique;
- every player name is a string whose `trim()` is non-empty; preserve the original value;
- every color is one accepted color and each of `RED`, `BLUE`, `ORANGE`, and `WHITE` appears exactly once;
- exactly one controller is `HUMAN`;
- exactly three controllers are `AI`;
- every AI `profileId` is a string whose `trim()` is non-empty;
- the seed is passed unchanged to accepted `createInitialRandomState`, which retains Task 04's exact empty-seed rule.

Do not require player names or AI profile IDs to be unique. Do not trim, lowercase, normalize, reorder, or otherwise rewrite accepted input values.

Invalid game creation is a configuration/programmer-boundary error, not an in-game player move. Throw an actionable `Error`; do not add a new `RuleViolationCode` and do not return `EngineResult` from `createGame`.

Do not generate a game ID, player ID, AI profile ID, command ID, timestamp, or any UUID.

## 3. Standard bank inventory

Export:

```ts
export const STANDARD_BANK_RESOURCE_COUNT = 19;
```

Create a fresh bank `ResourceBag` containing exactly 19 of each resource:

```text
LUMBER 19
BRICK  19
WOOL   19
GRAIN  19
ORE    19
```

Each `createGame` call must receive an independent bank-resource object.

## 4. Standard development deck source

Export one readonly standard source collection containing exactly 25 accepted `DevelopmentCardDefinition` objects in this exact source order:

```text
14 KNIGHT
 5 VICTORY_POINT
 2 ROAD_BUILDING
 2 MONOPOLY
 2 INVENTION
```

Use these exact deterministic string IDs:

```text
development-card:knight:01
development-card:knight:02
...
development-card:knight:14

development-card:victory-point:01
...
development-card:victory-point:05

development-card:road-building:01
development-card:road-building:02

development-card:monopoly:01
development-card:monopoly:02

development-card:invention:01
development-card:invention:02
```

Cast to the accepted branded `DevelopmentCardId` only at the trusted source-construction boundary. IDs are opaque after construction and must not be parsed for behavior.

The source collection and its card objects must never be mutated. `createGame` must return fresh shuffled deck objects so that two games do not share mutable nested card references with each other or with the exported source.

The top of the development deck is frozen as array index `0`. Drawing is not implemented in this task.

## 5. Exact game-creation random order

Random draw order is part of replay compatibility. `createGame` must perform these operations in exactly this order:

1. Validate `GameConfig`.
2. Call `createInitialRandomState(seed)` with the exact unmodified seed.
3. Call accepted `createStandardInitialBoard(random)`.
4. From the returned random state, call `nextRandomInt(random, 0, 4)` exactly once to choose the first player's index in the input clockwise player tuple.
5. Rotate the four input player configs so the chosen player becomes `playerOrder[0]`, preserving the remaining clockwise cyclic order. Do **not** shuffle all players.
6. From the post-first-player random state, call accepted `shuffleWithRandom` exactly once on the frozen 25-card source deck.
7. Clone the shuffled card definitions into the bank deck without consuming random draws.
8. Construct players, bank, turn, awards, and the complete `GameState` without decorative or extra random draws.
9. Validate the complete creation result before returning it.

Do not change board generation draw order, choose the first player before board generation, shuffle the deck before first-player selection, consume AI-personality randomness, or add random IDs.

## 6. Exact initial `GameState`

The newly created state must contain:

```text
schemaVersion = GAME_STATE_SCHEMA_VERSION
gameId        = config.gameId
stateVersion  = 0
rulesetId     = RULESET_ID
board         = accepted generated initial BoardState
playerOrder   = rotated clockwise four-player tuple
winnerId      = null
pendingDecision = null
```

Each `PlayerState` must clone public identity/controller data from the corresponding config and begin with:

```text
resources        = all five resources at 0
developmentCards = []
playedKnights    = 0
```

Do not store piece supply, buildings, roads, ports, score, legal actions, setup history, or AI memory in `PlayerState`.

The initial bank contains:

```text
resources       = 19 of each resource
developmentDeck = the deterministically shuffled 25-card deck
```

Awards begin:

```text
longestRoadHolderId = null
largestArmyHolderId = null
```

The initial turn is exactly:

```ts
{
  turnNumber: 0,
  currentPlayerId: playerOrder[0],
  phase: "SETUP_SETTLEMENT",
  setup: {
    round: 1,
    placementIndex: 0,
    pendingSettlementVertexId: null,
  },
  lastRoll: null,
  developmentCardPlayedThisTurn: false,
}
```

No `TURN_STARTED` event is emitted by `createGame`; it returns state, not an `EngineResult`. Setup placement is not a normal numbered turn.

All returned values must be plain JSON-compatible data. Two equal calls must be structurally equal but return independent object/array graphs.

# Golden game-creation fixture

## 7. Frozen Task 05 config

Use this independent fixture in tests, with the accepted branded casts only at the test boundary:

```text
gameId: game:task-05
rulesetId: BASE_4P_COMBINED_ACTION_V1

Input clockwise players:
0  player:human     Frankie   RED     HUMAN
1  player:merchant  Merchant  BLUE    AI  ai:merchant
2  player:builder   Builder   ORANGE  AI  ai:builder
3  player:sentinel  Sentinel  WHITE   AI  ai:sentinel

seed: FRONTIER-ISLES-TASK-05
```

## 8. Frozen creation anchors

For the fixture above:

```text
Initial random:
state     = 1571516003
drawCount = 0

After accepted board generation:
state     = 2850798816
drawCount = 59

Chosen first-player input index:
3

After first-player selection:
state     = 277719227
drawCount = 60

Final after deck shuffle:
state     = 3364541899
drawCount = 84
```

No rejection draw occurs in this golden creation flow.

The rotated player order is exactly:

```text
player:sentinel
player:human
player:merchant
player:builder
```

Board anchors from the accepted generator are:

```text
desert / robber: tile:2,0

red numbers:
tile:0,-1  8
tile:-1,1  8
tile:0,2   6
tile:2,-2  6
```

## 9. Frozen shuffled development deck

For the golden fixture, array index `0` is the top card. The exact order is:

```text
00 development-card:victory-point:03  VICTORY_POINT
01 development-card:knight:09         KNIGHT
02 development-card:knight:13         KNIGHT
03 development-card:knight:01         KNIGHT
04 development-card:monopoly:01       MONOPOLY
05 development-card:knight:12         KNIGHT
06 development-card:knight:07         KNIGHT
07 development-card:victory-point:05  VICTORY_POINT
08 development-card:monopoly:02       MONOPOLY
09 development-card:knight:04         KNIGHT
10 development-card:knight:02         KNIGHT
11 development-card:invention:02      INVENTION
12 development-card:knight:14         KNIGHT
13 development-card:victory-point:02  VICTORY_POINT
14 development-card:victory-point:01  VICTORY_POINT
15 development-card:knight:06         KNIGHT
16 development-card:road-building:02  ROAD_BUILDING
17 development-card:knight:11         KNIGHT
18 development-card:road-building:01  ROAD_BUILDING
19 development-card:knight:03         KNIGHT
20 development-card:knight:05         KNIGHT
21 development-card:invention:01      INVENTION
22 development-card:knight:08         KNIGHT
23 development-card:knight:10         KNIGHT
24 development-card:victory-point:04  VICTORY_POINT
```

# Frozen initial-setup decisions

## 10. Setup-order semantics

`SetupTurnState.placementIndex` is frozen as a zero-based index **within the current round**, always `0..3`.

Given `playerOrder = [A, B, C, D]`:

```text
round 1 index 0 -> A
round 1 index 1 -> B
round 1 index 2 -> C
round 1 index 3 -> D
round 2 index 0 -> D
round 2 index 1 -> C
round 2 index 2 -> B
round 2 index 3 -> A
```

The complete placement order is therefore:

```text
A, B, C, D, D, C, B, A
```

At `SETUP_SETTLEMENT`:

```text
pendingSettlementVertexId = null
```

After a successful settlement command:

```text
phase = SETUP_ROAD
pendingSettlementVertexId = the just-placed vertex
currentPlayerId is unchanged
round and placementIndex are unchanged
```

After a successful road command, clear the pending vertex and advance to the next setup placement. The fourth player therefore takes the final first-round road and immediately remains current player for the first settlement of round 2.

## 11. Setup command validation boundary

`executeInitialSetupCommand` must be pure and must never mutate the supplied state or command envelope.

Before command-specific validation, use this frozen failure precedence:

1. corrupted setup-state/programmer invariant -> throw actionable `Error`;
2. `expectedStateVersion !== state.stateVersion` -> `STALE_STATE_VERSION`;
3. actor ID does not exist in `state.players` -> `UNKNOWN_ACTOR`;
4. `winnerId !== null` or phase `GAME_OVER` -> `GAME_OVER`;
5. `pendingDecision !== null` -> `PENDING_DECISION_REQUIRED`;
6. actor is not `turn.currentPlayerId` -> `NOT_YOUR_TURN`;
7. command does not match the required setup phase -> `WRONG_PHASE`;
8. target legality and piece-supply checks described below.

`RuleViolation.details`, when used, must contain only accepted serializable primitive values. Do not add localized English messages or arrays/objects to details.

A failed command:

- returns the accepted failure branch;
- produces no state and no events;
- consumes no random draw;
- does not mutate input state;
- does not change `stateVersion`.

A successful setup command:

- returns the accepted success branch;
- increments `stateVersion` by exactly 1;
- leaves `random` structurally unchanged;
- emits events in the exact order below;
- changes only the necessary immutable state branches.

Do not store processed `commandId` values or implement idempotency/deduplication in this task.

## 12. Initial settlement rules

`PLACE_INITIAL_SETTLEMENT` is legal only when:

- phase is `SETUP_SETTLEMENT`;
- `turn.setup` exists and `pendingSettlementVertexId === null`;
- the target vertex exists in the accepted topology;
- the target vertex is empty;
- every adjacent vertex is free of every settlement or city;
- the acting player currently has fewer than 5 settlement pieces on the board.

Setup settlement placement:

- does not require connection to an existing road;
- does not cost resources;
- places the accepted `Building` shape as the acting player's `SETTLEMENT`;
- does not inspect or alter normal-turn legal-action selectors.

Use these violation codes:

```text
unknown or occupied target vertex -> ILLEGAL_VERTEX
adjacent occupied vertex          -> DISTANCE_RULE_VIOLATION
five settlements already on board -> INSUFFICIENT_PIECES
```

Do not add a new violation code.

On success, emit first:

```text
SETTLEMENT_BUILT source=INITIAL_PLACEMENT
```

using the exact accepted Task 01 event shape.

## 13. Immediate second-settlement resource grant

When and only when `turn.setup.round === 2`, grant starting resources **inside the successful settlement command**, immediately after placing the settlement and before the player places its road.

For the newly placed vertex:

1. Read its accepted adjacent tile IDs from topology.
2. Sort them explicitly with the accepted deterministic code-unit comparator; do not rely on object insertion order.
3. For each adjacent producing terrain tile, demand exactly one matching resource:

```text
FOREST     -> LUMBER
HILLS      -> BRICK
PASTURE    -> WOOL
FIELDS     -> GRAIN
MOUNTAINS  -> ORE
DESERT     -> no resource
```

4. Transfer granted cards from bank to the acting player atomically within the successful command.
5. Desert contributes nothing. Number tokens do not affect setup grants.
6. The initial robber is on the desert and therefore does not block a producing setup tile.

Use the accepted `RESOURCE_PRODUCED` event to report granted per-tile allocations. It follows `SETTLEMENT_BUILT` in the returned event list. Do not add a new starting-resource event discriminant.

### Setup bank-shortage behavior

Only one player is being granted starting resources during this command. For each resource independently:

- if bank supply is at least demand, grant all demanded cards;
- if bank supply is lower than demand, grant as many as remain;
- choose granted per-tile allocations in the explicit sorted adjacent-tile order;
- emit the accepted `RESOURCE_PRODUCTION_BLOCKED` event for each resource with unmet demand, using reason `BANK_SHORTAGE` and the acting player as the affected player;
- never make bank resources negative.

Event order for a round-2 settlement is frozen as:

```text
1. SETTLEMENT_BUILT
2. One RESOURCE_PRODUCED event per granted producing tile, in explicitly sorted adjacent-tile order
3. RESOURCE_PRODUCTION_BLOCKED events, in RESOURCE_TYPES order, for resources with unmet demand
```

In an ordinary newly created game, the full 19-card bank means no setup shortage occurs.

## 14. Initial road rules

`PLACE_INITIAL_ROAD` is legal only when:

- phase is `SETUP_ROAD`;
- `turn.setup` exists;
- `pendingSettlementVertexId` is non-null;
- the pending vertex contains the acting player's just-placed `SETTLEMENT`;
- the target edge exists;
- the target edge is empty;
- the target edge has `pendingSettlementVertexId` as one of its two endpoints;
- the acting player currently has fewer than 15 road pieces on the board.

Initial road placement:

- does not cost resources;
- does not need any other existing road connection;
- places the accepted `Road` shape owned by the acting player;
- does not calculate Longest Road.

Use these violation codes:

```text
unknown or occupied target edge -> ILLEGAL_EDGE
edge not incident to pending settlement -> ROAD_NOT_CONNECTED
15 roads already on board -> INSUFFICIENT_PIECES
```

On success, emit:

```text
ROAD_BUILT source=INITIAL_PLACEMENT
```

using the exact accepted event shape.

## 15. Exact state transitions after a setup road

For round 1:

```text
index 0 road -> round 1, index 1, next player B, SETUP_SETTLEMENT
index 1 road -> round 1, index 2, next player C, SETUP_SETTLEMENT
index 2 road -> round 1, index 3, next player D, SETUP_SETTLEMENT
index 3 road -> round 2, index 0, same player D, SETUP_SETTLEMENT
```

For round 2:

```text
index 0 road -> round 2, index 1, next player C, SETUP_SETTLEMENT
index 1 road -> round 2, index 2, next player B, SETUP_SETTLEMENT
index 2 road -> round 2, index 3, next player A, SETUP_SETTLEMENT
index 3 road -> setup complete
```

After the final round-2 road:

```ts
turn = {
  turnNumber: 1,
  currentPlayerId: playerOrder[0],
  phase: "ROLL_REQUIRED",
  setup: null,
  lastRoll: null,
  developmentCardPlayedThisTurn: false,
};

pendingDecision = null
winnerId = null
```

Append one accepted:

```text
TURN_STARTED playerId=playerOrder[0] turnNumber=1
```

after the final `ROAD_BUILT` event. Do not emit `TURN_ENDED` during setup.

# Golden full setup replay

## 16. Exact 16-command fixture

Starting from the Task 05 golden-created game, execute these exact successful commands. `expectedStateVersion` is shown in the first column. Use any deterministic non-empty test `CommandId` values; command IDs do not affect state.

```text
00 player:sentinel PLACE_INITIAL_SETTLEMENT vertex:-1,-1,2
01 player:sentinel PLACE_INITIAL_ROAD       edge:vertex:-1,-1,2|vertex:-2,-2,4

02 player:human    PLACE_INITIAL_SETTLEMENT vertex:-1,-4,5
03 player:human    PLACE_INITIAL_ROAD       edge:vertex:-1,-4,5|vertex:-2,-2,4

04 player:merchant PLACE_INITIAL_SETTLEMENT vertex:-1,-7,8
05 player:merchant PLACE_INITIAL_ROAD       edge:vertex:-1,-7,8|vertex:-2,-5,7

06 player:builder  PLACE_INITIAL_SETTLEMENT vertex:-1,2,-1
07 player:builder  PLACE_INITIAL_ROAD       edge:vertex:-1,2,-1|vertex:-2,1,1

08 player:builder  PLACE_INITIAL_SETTLEMENT vertex:-1,5,-4
09 player:builder  PLACE_INITIAL_ROAD       edge:vertex:-1,5,-4|vertex:-2,4,-2

10 player:merchant PLACE_INITIAL_SETTLEMENT vertex:-1,8,-7
11 player:merchant PLACE_INITIAL_ROAD       edge:vertex:-1,8,-7|vertex:-2,7,-5

12 player:human    PLACE_INITIAL_SETTLEMENT vertex:-4,-1,5
13 player:human    PLACE_INITIAL_ROAD       edge:vertex:-2,-2,4|vertex:-4,-1,5

14 player:sentinel PLACE_INITIAL_SETTLEMENT vertex:-4,-4,8
15 player:sentinel PLACE_INITIAL_ROAD       edge:vertex:-2,-5,7|vertex:-4,-4,8
```

The sequence is independently frozen; tests must not discover it by calling the production legality function and then selecting its first result.

## 17. Exact round-2 resource grants

The round-2 settlement commands grant:

```text
player:builder at vertex:-1,5,-4
  tile:-1,-1 HILLS  -> BRICK
  tile:0,-1  FIELDS -> GRAIN
  tile:0,-2  HILLS  -> BRICK
  total: BRICK 2, GRAIN 1

player:merchant at vertex:-1,8,-7
  tile:0,-2 HILLS -> BRICK
  total: BRICK 1

player:human at vertex:-4,-1,5
  tile:-1,1 FIELDS  -> GRAIN
  tile:-1,2 HILLS   -> BRICK
  tile:-2,2 PASTURE -> WOOL
  total: BRICK 1, WOOL 1, GRAIN 1

player:sentinel at vertex:-4,-4,8
  tile:-1,2 HILLS -> BRICK
  total: BRICK 1
```

Starting resources must already be present immediately after each corresponding settlement command, before its road command.

## 18. Exact final replay state

After all 16 commands:

```text
stateVersion = 16
turnNumber   = 1
phase        = ROLL_REQUIRED
setup        = null
currentPlayerId = player:sentinel
pendingDecision = null
winnerId = null
```

Each player owns exactly:

```text
2 settlements
2 roads
0 cities
```

Player resources are:

```text
player:human
  LUMBER 0, BRICK 1, WOOL 1, GRAIN 1, ORE 0

player:merchant
  LUMBER 0, BRICK 1, WOOL 0, GRAIN 0, ORE 0

player:builder
  LUMBER 0, BRICK 2, WOOL 0, GRAIN 1, ORE 0

player:sentinel
  LUMBER 0, BRICK 1, WOOL 0, GRAIN 0, ORE 0
```

Final bank resources are:

```text
LUMBER 19
BRICK  14
WOOL   18
GRAIN  17
ORE    19
```

The development deck and the entire random state remain exactly unchanged from game creation:

```text
random.state     = 3364541899
random.drawCount = 84
```

Across the 16 commands, emitted event totals are:

```text
SETTLEMENT_BUILT  8
RESOURCE_PRODUCED 8
ROAD_BUILT        8
TURN_STARTED      1
```

There are no blocked-production events in the ordinary golden replay.
The ordinary golden replay emits 25 events in total.

# Setup-state integrity

## 19. Required invariant checks

Implement focused setup-state integrity checks sufficient to reject corrupted authoritative data before applying a setup command. Do not build a general persistence-validation framework.

At minimum reject with an actionable `Error`:

- schema/ruleset mismatch;
- player order that is not exactly four unique IDs present in `players`;
- current player not present or inconsistent with setup round/index;
- setup phase with `turn.setup === null`;
- `SETUP_SETTLEMENT` with a non-null pending settlement vertex;
- `SETUP_ROAD` with a null pending settlement vertex;
- round not `1 | 2` or placement index outside `0..3` at runtime;
- pending settlement vertex unknown, empty, owned by another player, or not a settlement;
- negative/non-integer bank or player resource counts;
- unknown occupancy IDs or occupancy owners;
- setup state with a non-null winner;
- setup state with a non-null pending decision.

The assertion must not mutate state.

Do not require setup resources to be reconstructable from board history because the model intentionally does not label which of a player's settlements was placed second.

# Source layout

## 20. Required focused layout

Use focused files under the existing domain directories. This layout is recommended and may be adjusted only for an equivalent documented separation already present in the accepted repository:

```text
src/game/
├── engine/
│   ├── create-game.ts
│   ├── game-creation-invariants.ts
│   ├── initial-setup-engine.ts
│   ├── initial-setup-invariants.ts
│   ├── create-game.test.ts
│   ├── initial-setup-engine.test.ts
│   └── initial-setup-invariants.test.ts
│
├── model/
│   ├── standard-bank.ts
│   └── standard-development-deck.ts
│
└── rules/
    ├── initial-settlement-rules.ts
    ├── initial-road-rules.ts
    └── starting-resource-grant.ts
```

Small shared pure helpers may be added when they have one clear responsibility. Do not add barrel `index.ts` files, a generic graph/rules framework, or empty speculative files.

`src/game/**` must retain the accepted import restrictions and remain independent of React, MUI, Zustand, browser storage, application services, AI, and networking.

# Tests

## 21. Required test coverage

Use Vitest only and add no dependency.

### Game creation

1. Runtime validation accepts the frozen Task 05 config.
2. Reject empty/whitespace game ID, wrong ruleset, non-four-player runtime input, duplicate player IDs, duplicate/missing colors, zero or multiple humans, wrong AI count, empty player name, and empty AI profile ID.
3. Standard bank begins at exactly 19 of every resource.
4. Standard development source contains exactly 25 unique IDs with the frozen type counts and exact source order.
5. Golden seed matches every intermediate/final random anchor, chosen starter, rotated player order, deck order, desert/red anchors, and exact initial turn fields.
6. Same config/seed returns structurally equal JSON but independent nested graphs.
7. Different seeds produce at least one meaningful deterministic difference without weakening invariants.
8. Config/source constants are not mutated.
9. Created state JSON serializes without `Map`, `Set`, class instance, function, or `Date` values.

### Setup settlement

10. The first expected player may place a legal settlement without cost or road connection.
11. Unknown and occupied vertices return `ILLEGAL_VERTEX`.
12. An adjacent occupied vertex returns `DISTANCE_RULE_VIOLATION`.
13. A synthetic player with five settlements returns `INSUFFICIENT_PIECES`.
14. A successful settlement changes only required state branches, increments version exactly once, leaves RNG unchanged, and emits the exact settlement event.
15. A round-2 settlement grants resources immediately before road placement, in deterministic adjacent-tile order.
16. Desert grants nothing.
17. A synthetic low-bank fixture grants partial supply without going negative and emits deterministic blocked-production events.

### Setup road

18. Road before settlement and settlement while road is required return `WRONG_PHASE`.
19. Unknown and occupied edges return `ILLEGAL_EDGE`.
20. A non-incident edge returns `ROAD_NOT_CONNECTED`.
21. A synthetic player with 15 roads returns `INSUFFICIENT_PIECES`.
22. A successful road costs nothing, increments version once, leaves RNG unchanged, clears the pending vertex, and emits the exact road event.

### Envelope and state integrity

23. Stale version, unknown actor, pending decision, wrong actor, and game-over conditions return the frozen violation code in the frozen precedence.
24. Every failed command leaves input state byte-for-byte/deeply unchanged and consumes no RNG draw.
25. Representative corrupted setup states throw actionable invariant errors rather than returning misleading player violations.

### Full snake replay

26. Execute the independent 16-command golden replay and assert every current-player/round/index/phase transition.
27. Assert the same fourth player acts consecutively across the round-1-to-round-2 boundary.
28. Assert all exact final ownership, resources, bank counts, phase, turn number, state version, event totals, development deck, and random state.
29. Final road returns events in exact order: `ROAD_BUILT`, then `TURN_STARTED`.
30. All accepted Task 00–04 tests continue to pass.
31. Production `src/game/**` contains no `Math.random` or other unauthorized randomness.

Do not derive expected golden placements by calling production legal-placement code. Do not use one giant snapshot as the sole proof; combine compact frozen records with focused assertions.

# Documentation

## 22. Authorized documentation changes

Only these documentation changes are expected:

1. Add this task file and prompt under `tasks/`.
2. Add `docs/adr/ADR-0004-deterministic-game-creation-and-initial-setup.md` recording:
   - board -> first-player rotation -> deck shuffle random order;
   - top-of-deck index `0`;
   - round-local setup index semantics;
   - immediate second-settlement resource grant;
   - setup-only command executor boundary.
3. Narrowly update `docs/ARCHITECTURE.md` with accepted `createGame` and setup-command execution status.
4. Narrowly clarify `docs/GAME_RULES.md`, only if needed, that second-settlement resources are granted on the settlement command before its road.
5. Update the README current-status section after all checks pass.

Do not rewrite unrelated rules, board projection decisions, AI design, trade design, or future networking architecture.

# Forbidden work

Do not implement or add:

- a generic full-game command router or `GameEngine` class;
- normal-turn `ROLL_DICE` execution or dice randomness;
- normal resource production;
- paid road/settlement/city building;
- development-card draw, ownership, purchase, play, or effects;
- robber movement, discard, theft, Knight behavior;
- domestic trade, maritime trade, ports as player abilities;
- Longest Road, Largest Army, score, victory, or hidden-card reveal;
- legal-action selectors or `PlayerView` projection;
- AI placement, AI turns, trade AI, AI memory, or randomness;
- Zustand, application controllers, gateway, persistence, routing, backend, networking;
- terrain/number/robber/building UI, interaction, animation, sound, or deployment;
- changes to Task 01 public contracts, Task 02 topology, Task 03 projection/UI, or Task 04 RNG/board behavior unless a true blocker is reported before implementation;
- new npm dependencies;
- a Git commit.

# Acceptance criteria

1. `createGame(config, seed)` deterministically creates the exact frozen authoritative initial state.
2. Runtime configuration validation rejects malformed four-player input without normalizing accepted values.
3. Bank and 25-card deck distributions, IDs, top convention, and creation draw order match the frozen specification.
4. First-player selection rotates clockwise seating rather than shuffling it.
5. Initial setup placement enforces turn, phase, empty target, distance/adjacency, and piece-supply rules.
6. Round-2 starting resources are granted immediately and bank transfers remain valid under shortage.
7. Setup progresses exactly `A,B,C,D,D,C,B,A` and enters turn 1 at `ROLL_REQUIRED`.
8. Successful commands increment state version once, preserve RNG, remain immutable, and emit exact ordered events.
9. Failed commands use accepted violation codes, follow frozen precedence, and leave state untouched.
10. Focused integrity checks reject representative corrupted setup states.
11. Golden creation and 16-command replay match all frozen anchors.
12. No accepted prior contract/algorithm/UI behavior is silently changed and no out-of-scope feature is added.
13. No dependency is added.
14. `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, and `npm run check` all pass.
15. Completion report follows `AGENTS.md` and includes the additions below.

# Completion report additions

In addition to the normal `AGENTS.md` report, include:

- exact public APIs and source files added;
- all config-validation rules;
- exact bank/development-deck source distributions and ID convention;
- exact game-creation random operation order;
- golden initial/post-board/post-starter/final random states and draw counts;
- selected first-player index, final rotated order, complete shuffled deck order, and top-card convention;
- exact setup index semantics and full actor order;
- exact successful golden placement IDs and starting-resource grants;
- final state version, turn state, player resources, bank resources, ownership counts, RNG/deck preservation, and event totals;
- exact test-file/test totals and command results;
- dependencies added, or explicit confirmation none changed;
- any deviation, blocker, or ambiguity rather than a silent interpretation;
- explicit confirmation that no normal-turn engine, dice, paid building, development-card behavior, robber, trade, awards, selectors, AI, store, gateway, persistence, UI, backend, networking, or Git commit was added.
