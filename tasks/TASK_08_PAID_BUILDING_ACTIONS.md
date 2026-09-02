# Task 08 — Paid Road, Settlement, and City Building Actions

## Status

Ready for Codex implementation after Task 07 is accepted and committed as a clean checkpoint.

## Objective

Implement the three normal-turn paid building commands that are legal during the combined `ACTION` phase:

- `BUILD_ROAD`;
- `BUILD_SETTLEMENT`;
- `UPGRADE_CITY`.

This task must provide:

- the exact standard resource costs and physical-piece limits;
- immutable player-to-bank resource payment;
- authoritative road connectivity, including opponent-building interruption;
- settlement occupancy, distance, road-connection, and piece-supply rules;
- city upgrade ownership and city-piece rules;
- exact accepted build events and event sources;
- deterministic validation precedence;
- focused state-integrity assertions;
- a four-command golden combined-action replay;
- integration proving paid building is legal after a resolved Task 07 total-seven workflow;
- corruption, legality, payment, conservation, immutability, and regression tests.

This task deliberately does **not** implement Longest Road calculation, award transfer, victory-point calculation, victory resolution, development-card purchase/play, Road Building free placement, domestic trade, maritime trade, AI, player-view projection, stores, gateways, persistence, routing, backend, networking, or UI interaction.

## Mandatory reading

Read in this order before changing code:

1. `AGENTS.md`
2. `docs/PRODUCT_SCOPE.md`
3. `docs/GAME_RULES.md`
4. `docs/ARCHITECTURE.md`
5. `docs/BOARD_MODEL.md`
6. `docs/CODING_STANDARDS.md`
7. `docs/adr/ADR-0001-v1-architecture-baseline.md`
8. `docs/adr/ADR-0003-deterministic-seeded-board-generation.md`
9. `docs/adr/ADR-0004-deterministic-game-creation-and-initial-setup.md`
10. `docs/adr/ADR-0005-deterministic-dice-production-and-turn-lifecycle.md`
11. `docs/adr/ADR-0006-discard-robber-and-random-theft-workflow.md`
12. `tasks/TASK_01_DOMAIN_CONTRACTS.md`
13. `tasks/TASK_02_STANDARD_BOARD_TOPOLOGY.md`
14. `tasks/TASK_04_SEEDED_STANDARD_BOARD_CONTENT.md`
15. The corrected and accepted `tasks/TASK_05_GAME_CREATION_AND_INITIAL_SETUP.md`
16. `tasks/TASK_06_DICE_PRODUCTION_AND_TURN_LIFECYCLE.md`
17. `tasks/TASK_07_DISCARD_ROBBER_AND_THEFT_WORKFLOW.md`
18. This task file

Inspect and reuse the accepted contracts and helpers. Do not duplicate resource validation, resource arithmetic, piece counting, topology traversal, or state-invariant logic when an accepted equivalent already exists. A small refactor is permitted only when it preserves every accepted public contract and all previous behaviour.

## Preflight

1. Run `git status --short` and report the exact result.
2. The expected starting tree is clean except for the two newly supplied Task 08 files under `tasks/`.
3. Run `npm run check` before changing production source. Stop and report a blocker if the accepted Task 07 baseline fails.
4. Confirm the baseline reports 23 test files and 164 passing tests.
5. Confirm the accepted Task 05 specification still contains the corrected total `RESOURCE_PRODUCED 8`.
6. Confirm the accepted Task 07 final state may legally be `ACTION` with a total-seven `lastRoll` and `pendingDecision = null`.
7. Do not alter package versions or install dependencies.
8. Do not create a Git commit.

# Required public boundary

## 1. Narrow paid-building command API

Do not yet implement the complete future generic `execute(GameCommand)` router. Export a narrow command boundary for exactly the commands in this task:

```ts
export type PaidBuildingCommand = Extract<
  GameCommand,
  | { readonly type: "BUILD_ROAD" }
  | { readonly type: "BUILD_SETTLEMENT" }
  | { readonly type: "UPGRADE_CITY" }
>;

export type PaidBuildingCommandEnvelope = Omit<
  CommandEnvelope,
  "command"
> & {
  readonly command: PaidBuildingCommand;
};

export function executePaidBuildingCommand(
  state: GameState,
  envelope: PaidBuildingCommandEnvelope,
): EngineResult;
```

Equivalent TypeScript syntax is allowed only when the exported semantics and narrow union are identical.

The future complete command router will compose the accepted setup, turn-lifecycle, robber, paid-building, development-card, and trade executors. Do not add a misleading incomplete generic router in this task.

## 2. Standard costs and piece limits

Provide readonly exported standard definitions with these exact values:

```text
ROAD
  LUMBER 1
  BRICK  1
  WOOL   0
  GRAIN  0
  ORE    0

SETTLEMENT
  LUMBER 1
  BRICK  1
  WOOL   1
  GRAIN  1
  ORE    0

CITY
  LUMBER 0
  BRICK  0
  WOOL   0
  GRAIN  2
  ORE    3
```

Physical-piece limits per player are exactly:

```text
ROAD       15
SETTLEMENT  5
CITY         4
```

Counts are always derived from authoritative `BoardState` occupancy. Do not add piece counts to `PlayerState` or `GameState`.

A city upgrade removes one active settlement from the board and creates one active city at the same vertex. The settlement piece is therefore available again automatically through derived counting.

Use accepted `ResourceBag`, `ResourceType`, `RESOURCE_TYPES`, `Building`, and `Road` contracts unchanged.

# Frozen common command semantics

## 3. Successful command rule

Every successful Task 08 command:

- increments `stateVersion` by exactly one;
- returns a new top-level `GameState` and immutable updated branches;
- emits exactly the accepted build event specified for that command;
- deducts the exact cost from the acting player and returns it to the bank atomically;
- consumes no random draw;
- keeps `turnNumber`, `currentPlayerId`, `phase`, `lastRoll`, `developmentCardPlayedThisTurn`, `setup`, `pendingDecision`, `winnerId`, awards, player order, development deck, terrain, number tokens, robber position, and all unrelated occupancy unchanged;
- remains in `ACTION` after success.

Unchanged branches may use safe structural sharing. The supplied state and envelope must never be mutated.

A failed player command:

- returns the accepted `EngineResult` failure branch;
- returns no state and no events;
- consumes no random draw;
- does not change `stateVersion`;
- leaves the state and envelope deeply unchanged.

Corrupt authoritative state is a programmer/data invariant failure and must throw an actionable `Error`, not return a gameplay violation.

## 4. Shared validation precedence

Before command-specific validation, use this exact precedence:

1. corrupt authoritative state -> throw actionable `Error`;
2. `expectedStateVersion !== state.stateVersion` -> `STALE_STATE_VERSION`;
3. actor ID absent from `state.players` -> `UNKNOWN_ACTOR`;
4. `winnerId !== null` or phase `GAME_OVER` -> `GAME_OVER`;
5. `pendingDecision !== null` -> `PENDING_DECISION_REQUIRED`;
6. actor is not `turn.currentPlayerId` -> `NOT_YOUR_TURN`;
7. phase is not `ACTION` -> `WRONG_PHASE`;
8. command-specific target, topology, connectivity, piece, and affordability checks below.

A build command in `FREE_ROAD_PLACEMENT` is not a paid build in this task and returns `WRONG_PHASE`. A future Road Building card task will provide its own narrow execution path.

`RuleViolation.details`, when used, must contain only accepted serializable primitive values. Do not add localized messages or change the accepted violation-code union.

## 5. Atomic resource payment

For every successful paid build:

1. Validate affordability only after the command's frozen topology, placement, connectivity, and piece-supply checks.
2. Compare resources in exact `RESOURCE_TYPES` order.
3. If any required resource is short, return `INSUFFICIENT_RESOURCES` and make no change.
4. Otherwise subtract the exact cost from the acting player's `resources`.
5. Add the exact same cards to `bank.resources`.
6. Preserve per-resource bank-plus-player conservation at exactly 19.
7. Never make a player or bank resource count negative or non-integer.

Do not return `BANK_RESOURCE_UNAVAILABLE`; paid construction returns cards to the bank rather than drawing cards from it.

If accepted source already has suitable pure resource-bag validation or arithmetic helpers, reuse or narrowly generalize them instead of creating conflicting duplicate implementations.

# Paid road rules

## 6. `BUILD_ROAD` target and connectivity precedence

After the shared checks, apply this exact order:

1. target edge does not exist or is already occupied -> `ILLEGAL_EDGE`;
2. determine whether the road is legally connected, blocked by an opponent building, or disconnected as specified below;
3. if blocked and no other legal endpoint exists -> `ROAD_BLOCKED`;
4. if disconnected and not blocked -> `ROAD_NOT_CONNECTED`;
5. acting player already owns 15 roads -> `INSUFFICIENT_PIECES`;
6. acting player cannot afford the road cost -> `INSUFFICIENT_RESOURCES`.

## 7. Exact paid-road connection rule

A target empty edge is legally connected when **at least one** endpoint supplies a legal connection.

For each endpoint vertex independently:

### Legal through the actor's own building

If that endpoint contains the acting player's `SETTLEMENT` or `CITY`, it supplies a legal connection even when the player has no other road incident to that vertex.

### Legal through an empty intersection

If that endpoint is empty, it supplies a legal connection when at least one other incident edge is occupied by a road owned by the acting player.

Exclude the target edge itself from this check.

### Blocked by an opponent building

If that endpoint contains another player's `SETTLEMENT` or `CITY`, the acting player's incident road network may not pass through that vertex.

If at least one other incident edge at that opponent-occupied endpoint belongs to the acting player, record a blocked connection candidate, but do not treat it as legal.

### Final result

- If either endpoint supplies a legal connection, the placement is connected and succeeds past this check.
- Otherwise, if at least one endpoint has a blocked connection candidate, return `ROAD_BLOCKED`.
- Otherwise return `ROAD_NOT_CONNECTED`.

Roads owned by other players do not create a connection and do not independently block an empty vertex. Different players' roads may meet at an empty intersection.

On success:

- place the accepted `Road` shape with the acting owner on the target edge;
- emit exactly one accepted `ROAD_BUILT` event;
- event source must be `PAID_BUILD`.

Do not calculate or emit a Longest Road change in this task.

# Paid settlement rules

## 8. `BUILD_SETTLEMENT` validation order

After the shared checks, apply this exact order:

1. target vertex does not exist or is already occupied -> `ILLEGAL_VERTEX`;
2. any immediately adjacent vertex contains a settlement or city -> `DISTANCE_RULE_VIOLATION`;
3. no incident edge is occupied by a road owned by the acting player -> `ROAD_NOT_CONNECTED`;
4. acting player already owns 5 active settlements -> `INSUFFICIENT_PIECES`;
5. acting player cannot afford the settlement cost -> `INSUFFICIENT_RESOURCES`.

Normal paid settlement placement differs from initial setup:

- it must connect to at least one of the acting player's roads;
- it must obey the distance rule;
- it costs resources;
- it may be built at a port vertex without storing any explicit port ownership;
- port control remains derived from board occupancy;
- the presence of another player's road at the same empty intersection does not prohibit settlement placement when the actor also has an incident road and every other rule is satisfied;
- creating a settlement may interrupt another player's road network, but award recalculation is deferred.

On success:

- place the accepted `Building` shape as the acting player's `SETTLEMENT`;
- emit exactly one accepted `SETTLEMENT_BUILT` event;
- event source must be `PAID_BUILD`.

Do not grant starting resources for a paid settlement.

# City upgrade rules

## 9. `UPGRADE_CITY` validation order

After the shared checks, apply this exact order:

1. target vertex does not exist -> `ILLEGAL_VERTEX`;
2. target vertex is empty, contains an opponent building, or already contains a city -> `ILLEGAL_VERTEX`;
3. acting player already owns 4 active cities -> `INSUFFICIENT_PIECES`;
4. acting player cannot afford the city cost -> `INSUFFICIENT_RESOURCES`.

A city may only replace the acting player's own existing `SETTLEMENT`. It may not be created on an empty vertex and may not upgrade an opponent's settlement or an existing city.

On success:

- replace the settlement at the same vertex with the accepted acting player's `CITY` shape;
- do not emit a separate settlement-removal event;
- emit exactly one accepted `CITY_BUILT` event.

Do not change the vertex ID, roads, adjacent topology, port geometry, or robber state.

# State integrity

## 10. Focused paid-building invariants

Implement or compose focused non-mutating authoritative-state assertions sufficient to reject at least:

- invalid, negative, fractional, or unsafe-integer resource counts;
- per-resource bank-plus-player conservation other than 19;
- occupancy that refers to an unknown player;
- occupancy key that is not present in topology;
- malformed building or road ownership/type data crossing runtime boundaries;
- more than 15 roads for one player;
- more than 5 active settlements for one player;
- more than 4 active cities for one player;
- a completed game whose phase/winner fields contradict accepted invariants;
- an `ACTION` state with a non-null pending decision;
- accepted Task 06/07 normal-turn and resolved-seven invariant corruption.

The assertion must not reject a structurally valid state merely because it is currently in a non-`ACTION` phase; calling a paid-building command in that state must reach the frozen `WRONG_PHASE` gameplay violation after general integrity checks.

Do not require every historical road or settlement in an otherwise valid persisted state to be reconstructably legal from an action log. Validate present authoritative structure, ownership, counts, and conservation rather than inventing event-history requirements.

# Golden combined-action replay

## 11. Exact golden starting state

Construct the fixture by:

1. creating the accepted Task 05 golden game;
2. executing the accepted 16-command initial setup replay;
3. executing the accepted first Task 06 `ROLL_DICE` command for Sentinel from state version 16.

This produces the accepted boundary:

```text
stateVersion       = 17
turnNumber         = 1
currentPlayerId    = player:sentinel
phase              = ACTION
lastRoll           = [3,2], total 5
pendingDecision    = null
winnerId           = null
random.state       = 1264537981
random.drawCount   = 86
```

Before the Task 08 commands, create a **test-only** resource-rebalanced clone. Do not add a production cheat/setup API. Preserve conservation by transferring cards only from the bank to Sentinel.

Exact starting hands for the golden Task 08 replay:

```text
player:sentinel
  LUMBER 3, BRICK 3, WOOL 1, GRAIN 3, ORE 3

player:human
  LUMBER 0, BRICK 1, WOOL 1, GRAIN 1, ORE 0

player:merchant
  LUMBER 0, BRICK 1, WOOL 0, GRAIN 0, ORE 0

player:builder
  LUMBER 0, BRICK 3, WOOL 0, GRAIN 1, ORE 0
```

Exact starting bank:

```text
LUMBER 16
BRICK  11
WOOL   17
GRAIN  14
ORE    16
```

All board occupancy, deck, awards, turn data, player order, controller/identity data, and random state are otherwise identical to the accepted post-roll state. The test-only rebalance does not change `stateVersion` and does not create events.

## 12. Exact four-command replay

Execute these commands with deterministic non-empty test command IDs:

```text
expected version 17
player:sentinel BUILD_ROAD
edge:vertex:-1,-1,2|vertex:1,-2,1

expected version 18
player:sentinel BUILD_ROAD
edge:vertex:1,-2,1|vertex:2,-1,-1

expected version 19
player:sentinel BUILD_SETTLEMENT
vertex:2,-1,-1

expected version 20
player:sentinel UPGRADE_CITY
vertex:2,-1,-1
```

Independent topology anchors for the settlement target are:

```text
target vertex:
vertex:2,-1,-1

adjacent vertices, deterministic sorted order:
vertex:1,-2,1
vertex:1,1,-2
vertex:4,-2,-2

adjacent tiles, deterministic sorted order:
tile:0,0
tile:1,-1
tile:1,0
```

The first road is connected directly to Sentinel's existing settlement at `vertex:-1,-1,2`. The second road is connected through the empty `vertex:1,-2,1` to the first newly built road. The settlement is two edges from the original settlement, has no adjacent building, and is connected to the second road.

The city upgrade in the same `ACTION` phase proves Trade/Build-style combined action sequencing does not require an intervening roll or turn transition.

## 13. Exact golden intermediate resources

After first road:

```text
Sentinel: LUMBER 2, BRICK 2, WOOL 1, GRAIN 3, ORE 3
Bank:     LUMBER 17, BRICK 12, WOOL 17, GRAIN 14, ORE 16
```

After second road:

```text
Sentinel: LUMBER 1, BRICK 1, WOOL 1, GRAIN 3, ORE 3
Bank:     LUMBER 18, BRICK 13, WOOL 17, GRAIN 14, ORE 16
```

After settlement:

```text
Sentinel: LUMBER 0, BRICK 0, WOOL 0, GRAIN 2, ORE 3
Bank:     LUMBER 19, BRICK 14, WOOL 18, GRAIN 15, ORE 16
```

After city:

```text
Sentinel: LUMBER 0, BRICK 0, WOOL 0, GRAIN 0, ORE 0
Bank:     LUMBER 19, BRICK 14, WOOL 18, GRAIN 17, ORE 19
```

## 14. Exact final golden state

After all four commands:

```text
stateVersion       = 21
turnNumber         = 1
currentPlayerId    = player:sentinel
phase              = ACTION
lastRoll           = [3,2], total 5
pendingDecision    = null
winnerId           = null
random.state       = 1264537981
random.drawCount   = 86
```

New occupancy:

```text
ROAD owned by player:sentinel
edge:vertex:-1,-1,2|vertex:1,-2,1

ROAD owned by player:sentinel
edge:vertex:1,-2,1|vertex:2,-1,-1

CITY owned by player:sentinel
vertex:2,-1,-1
```

There is no settlement remaining at `vertex:2,-1,-1` after the upgrade.

Final Sentinel piece counts derived from the board are:

```text
roads       4
settlements 2
cities      1
```

All other players' resources and occupancy are unchanged from the golden starting fixture. Board content, robber position, topology, development deck, awards, player order, and random state are unchanged.

Exact event sequence:

```text
ROAD_BUILT       source=PAID_BUILD
ROAD_BUILT       source=PAID_BUILD
SETTLEMENT_BUILT source=PAID_BUILD
CITY_BUILT
```

Exact event totals:

```text
ROAD_BUILT       2
SETTLEMENT_BUILT 1
CITY_BUILT       1
Total            4
```

There are no award, turn, resource-production, or game-won events.

# Required focused fixtures

## 15. Opponent-building road interruption

Create a structurally valid focused state in which:

- Sentinel owns these connected roads:

```text
edge:vertex:-1,-1,2|vertex:1,-2,1
edge:vertex:1,-2,1|vertex:2,-1,-1
```

- `vertex:2,-1,-1` contains another player's settlement;
- target edge is empty:

```text
edge:vertex:2,-1,-1|vertex:4,-2,-2
```

- the other endpoint does not independently connect to Sentinel's road or building network.

Attempting the target road must return `ROAD_BLOCKED`, not `ROAD_NOT_CONNECTED`. It must make no payment and consume no randomness.

The opponent settlement at `vertex:2,-1,-1` is geometrically compatible with the distance rule because none of its adjacent vertices contains another building in this focused fixture.

## 16. Required legality distinctions

Add independent tests proving at least:

- an unconnected empty edge returns `ROAD_NOT_CONNECTED`;
- an unknown or occupied edge returns `ILLEGAL_EDGE` before resource affordability;
- a road may connect directly to the actor's settlement or city;
- a road may continue through an empty vertex from another actor-owned road;
- an opponent road at an otherwise empty shared vertex neither connects nor blocks the actor;
- any legal endpoint overrides a blocked candidate on the other endpoint;
- a settlement on an unknown/occupied vertex returns `ILLEGAL_VERTEX`;
- an adjacent building returns `DISTANCE_RULE_VIOLATION`;
- a distance-valid but actor-road-disconnected vertex returns `ROAD_NOT_CONNECTED`;
- a paid settlement grants no starting resource;
- upgrading an empty vertex, an opponent settlement, or an existing city returns `ILLEGAL_VERTEX`;
- upgrading the actor's own settlement succeeds;
- every piece limit returns `INSUFFICIENT_PIECES` at exactly 15 roads, 5 settlements, or 4 cities;
- insufficient payment returns `INSUFFICIENT_RESOURCES` only after preceding target/connection/piece checks pass;
- exact-cost hands succeed and become zero for the paid resources;
- failed operations leave bank, players, board, RNG, version, and events unchanged.

## 17. Resolved-seven integration

Reconstruct the accepted Task 07 final `ACTION` state with:

```text
lastRoll.total    = 7
pendingDecision   = null
phase             = ACTION
random            = 1618009444 / 87
```

Use a test-only conservation-preserving resource rebalance and a fixed legal edge to prove one `BUILD_ROAD` command succeeds after the robber workflow. The build must consume no random draw and must remain compatible with accepted Task 06 `END_TURN` afterwards.

Do not replace the Task 07 workflow or loosen its invariants beyond what is necessary for the paid command to compose with the already accepted resolved state.

# Required tests

## 18. Test categories

Add focused tests covering at minimum:

1. exact build costs and piece limits;
2. derived road/settlement/city counts;
3. common validation precedence;
4. road target occupancy/existence;
5. road connection through own building;
6. road continuation through empty vertex;
7. opponent-building `ROAD_BLOCKED` distinction;
8. disconnected `ROAD_NOT_CONNECTED` distinction;
9. settlement distance and road-connection rules;
10. no paid-settlement resource grant;
11. city ownership and replacement rules;
12. all three physical-piece limits;
13. affordability and exact player-to-bank payment;
14. resource conservation after every success;
15. failure immutability and zero RNG consumption;
16. success version/event ordering and unchanged turn lifecycle;
17. exact four-command golden replay;
18. build after a resolved Task 07 seven;
19. accepted Task 00–07 regression suite;
20. production-source prohibition on `Math.random()` and alternate entropy.

Do not generate golden targets by asking the production legality function for its first available edge or vertex. Use the independently frozen IDs in this task.

# Required source layout

Use the existing architecture. The following focused layout is required unless an equivalent accepted convention is already present and documented:

```text
src/game/model/
├── standard-build-costs.ts
└── standard-piece-limits.ts

src/game/rules/
├── player-piece-counts.ts
├── paid-road-rules.ts
├── paid-settlement-rules.ts
├── city-upgrade-rules.ts
└── resource-payment.ts

src/game/engine/
├── paid-building-engine.ts
├── paid-building-invariants.ts
├── paid-building-engine.test.ts
└── paid-building-invariants.test.ts
```

Additional focused colocated tests are allowed. Avoid one oversized general utility file and avoid modifying UI modules.

# Documentation

Update narrowly:

- `docs/GAME_RULES.md` with exact costs, limits, road interruption, paid settlement, and city rules;
- `docs/ARCHITECTURE.md` with the narrow paid-building executor and no-RNG/payment boundary;
- `README.md` with Task 08 implementation status;
- add `docs/adr/ADR-0007-authoritative-paid-building-actions.md` documenting:
  - why build legality remains in the pure authoritative domain layer;
  - why resources move atomically back to the bank;
  - why piece counts are derived from board occupancy;
  - why opponent buildings block road continuation;
  - why award/victory calculation is deliberately deferred.

Do not rewrite unrelated documentation.

# Forbidden scope

Do not implement or change:

- Longest Road traversal or holder calculation;
- `LONGEST_ROAD_CHANGED` events;
- Largest Army;
- victory-point selectors, winner assignment, or `GAME_WON`;
- development-card purchase or effects;
- Road Building free roads or `FREE_ROAD_PLACEMENT` execution;
- domestic or maritime trade;
- legal-action projection for UI;
- PlayerView redaction;
- AI or AI evaluation;
- Zustand stores;
- gateways;
- local storage;
- routing;
- React/MUI/SVG UI;
- backend/networking;
- dependencies;
- Task 01 public contract shapes;
- accepted Task 02 topology behaviour;
- accepted Task 04 RNG/board generation;
- accepted Task 05 setup behaviour;
- accepted Task 06 dice/production/end-turn behaviour;
- accepted Task 07 discard/robber/theft behaviour.

Do not call `Math.random()`, Web Crypto, UUID generation, timestamps, or any hidden entropy source.

# Mandatory verification

Before completion run:

```text
npm run typecheck
npm run lint
npm run test
npm run build
npm run check
git diff --check
```

Also perform a production-source entropy audit covering at least `Math.random`, `crypto.getRandomValues`, `randomUUID`, `Date.now`, and `new Date` in `src/game/**`. Report false positives separately; do not introduce a brittle runtime source scanner into production code.

All commands must pass. Fix every in-scope failure before reporting completion.

# Completion report

Return:

1. files created or changed;
2. public APIs and reusable helpers implemented;
3. exact validation precedence;
4. exact road, settlement, city, payment, and piece-limit behaviour;
5. golden starting state, four commands, intermediate resources, final state, occupancy, counts, RNG, and event totals;
6. focused `ROAD_BLOCKED`, `ROAD_NOT_CONNECTED`, piece-limit, payment, failure, and resolved-seven results;
7. tests added and final repository test totals;
8. exact output/result of every mandatory command;
9. dependencies added or explicit confirmation that none changed;
10. deviations, blockers, or unresolved questions;
11. explicit confirmation that no forbidden feature was implemented;
12. explicit confirmation that no Git commit was created.
