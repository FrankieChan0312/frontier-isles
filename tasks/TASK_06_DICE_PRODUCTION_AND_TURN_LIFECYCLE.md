# Task 06 — Deterministic Dice, Resource Production, and Turn Lifecycle

## Status

Ready for Codex implementation after the corrected Task 05 implementation is accepted and committed as a clean checkpoint.

## Objective

Implement the first repeatable normal-turn vertical slice after initial setup:

- deterministic two-die rolling through the accepted `XORSHIFT32_V1` random-state API;
- normal resource production for totals other than `7`;
- robber blocking of the occupied tile;
- settlement/city production quantities;
- exact bank-shortage handling;
- transition from `ROLL_REQUIRED` to `ACTION`;
- transition from a rolled `7` into the accepted discard or robber pending-decision states;
- `END_TURN` advancement to the next clockwise player;
- a narrow lifecycle-command boundary using the accepted command/result/event contracts;
- deterministic golden replay fixtures over the accepted Task 05 completed setup state.

This task deliberately does **not** resolve discards, move the robber, steal a resource, build, trade, buy or play development cards, calculate awards or victory, create player views, run AI, or change the UI.

A rolled `7` may therefore leave the game at `DISCARD_REQUIRED` or `ROBBER_MOVE_REQUIRED`; Task 07 will complete that pending-decision workflow.

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
10. `tasks/TASK_01_DOMAIN_CONTRACTS.md`
11. `tasks/TASK_02_STANDARD_BOARD_TOPOLOGY.md`
12. `tasks/TASK_04_SEEDED_STANDARD_BOARD_CONTENT.md`
13. The **corrected and accepted** `tasks/TASK_05_GAME_CREATION_AND_INITIAL_SETUP.md`
14. This task file

Inspect and reuse the accepted contracts and implementation. Do not duplicate or silently widen them.

The corrected Task 05 per-tile starting-production semantics and the accepted total of eight `RESOURCE_PRODUCED` events remain authoritative.

## Preflight

1. Run `git status --short` and report the exact result.
2. The expected starting tree is clean except for the newly supplied Task 06 files under `tasks/`.
3. Run `npm run check` before changing production source. Stop and report a blocker if the accepted Task 05 baseline fails.
4. Confirm that the corrected Task 05 golden replay has 25 events and 8 `RESOURCE_PRODUCED` events.
5. Do not alter package versions or install dependencies.
6. Do not create a Git commit.

# Frozen public boundary

## 1. Dice API

Provide this exact pure API under the game random layer:

```ts
export function rollDice(
  random: RandomState,
): RandomResult<DiceRoll>;
```

Reuse the accepted `RandomState`, `RandomResult`, `DiceRoll`, `DieValue`, and `nextRandomInt` contracts/functions.

Do not add a second random source, mutable dice class, injected callback, seed parameter, forced-roll production option, or `Math.random()` path.

## 2. Narrow lifecycle command API

Do not prematurely implement the complete future `execute(GameCommand)` router. Provide a narrow command boundary for only the lifecycle commands implemented by this task:

```ts
export type NormalTurnLifecycleCommand = Extract<
  GameCommand,
  | { readonly type: "ROLL_DICE" }
  | { readonly type: "END_TURN" }
>;

export type NormalTurnLifecycleCommandEnvelope = Omit<
  CommandEnvelope,
  "command"
> & {
  readonly command: NormalTurnLifecycleCommand;
};

export function executeNormalTurnLifecycleCommand(
  state: GameState,
  envelope: NormalTurnLifecycleCommandEnvelope,
): EngineResult;
```

Equivalent TypeScript syntax is permitted only when the exported semantics and narrow command union are identical.

The future full command router will compose:

- the accepted Task 05 setup-command executor;
- this normal-turn lifecycle executor;
- later robber, build, development-card, and trade executors.

Do not make unimplemented `BUILD_*`, trade, development-card, or robber commands return a misleading `WRONG_PHASE` from a generic router in this task.

# Frozen dice decisions

## 3. Exact dice draw order

A successful `ROLL_DICE` command rolls two dice in this exact order:

1. `firstDie = nextRandomInt(random, 1, 7)`;
2. `secondDie = nextRandomInt(firstResult.random, 1, 7)`;
3. construct the accepted `DiceRoll` shape with the ordered tuple `[firstDie, secondDie]` and their total;
4. return the second draw's random state.

The first and second die are not sorted. A result `[6, 2]` must remain `[6, 2]`, not `[2, 6]`.

Each die normally consumes one unsigned draw. Rejection draws, if any, remain counted by the accepted `nextRandomInt` implementation. Do not duplicate bounded-integer logic inside the dice roller.

Validate the resulting die values/total at the trusted construction boundary. An impossible value is a programmer invariant error and must throw an actionable `Error`.

## 4. Dice event

A successful roll always emits exactly one accepted `DICE_ROLLED` event first, containing the exact ordered `DiceRoll` stored in `turn.lastRoll`.

Do not emit a separate event for each die.

# Frozen command validation

## 5. Failure precedence

`executeNormalTurnLifecycleCommand` must be pure and must not mutate its state or envelope.

Before command-specific work, use this frozen failure precedence:

1. corrupted authoritative normal-turn state -> throw actionable `Error`;
2. `expectedStateVersion !== state.stateVersion` -> `STALE_STATE_VERSION`;
3. actor ID absent from `state.players` -> `UNKNOWN_ACTOR`;
4. `winnerId !== null` or phase `GAME_OVER` -> `GAME_OVER`;
5. `pendingDecision !== null` -> `PENDING_DECISION_REQUIRED`;
6. actor is not `turn.currentPlayerId` -> `NOT_YOUR_TURN`;
7. command does not match its required phase -> `WRONG_PHASE`;
8. command-specific invariant work.

Required phases:

```text
ROLL_DICE -> ROLL_REQUIRED
END_TURN  -> ACTION
```

A failed command:

- returns the accepted failure branch;
- returns no state and no events;
- consumes no random draw;
- does not change `stateVersion`;
- leaves the supplied state and envelope deeply unchanged.

A successful lifecycle command increments `stateVersion` by exactly one, regardless of how many events it emits.

# Frozen normal production

## 6. Producing tiles

For a dice total other than `7`:

1. select topology tiles whose authoritative `TileContent.numberToken` equals the rolled total;
2. exclude `board.robberTileId` completely;
3. sort selected tiles explicitly by ascending axial `(q, r)` using topology coordinates;
4. derive production only from authoritative vertex occupancy adjacent to each selected tile.

Do not parse branded IDs to obtain coordinates and do not use SVG geometry.

The terrain/resource mapping is exactly:

```text
FOREST     -> LUMBER
HILLS      -> BRICK
PASTURE    -> WOOL
FIELDS     -> GRAIN
MOUNTAINS  -> ORE
DESERT     -> impossible producing tile
```

A numbered desert or unknown terrain is a corrupted-state invariant error.

## 7. Building yield and allocation identity

For each unblocked producing tile:

```text
SETTLEMENT -> 1 card
CITY       -> 2 cards
```

Aggregate all buildings belonging to the same player on the same tile into one candidate allocation:

```text
(playerId, tileId, resource, quantity)
```

Therefore, if one player has two settlements adjacent to the same producing tile, emit one eventual `RESOURCE_PRODUCED` event with `quantity = 2`, not two quantity-one events.

A player may have no allocation on a producing tile. Never emit a zero-quantity event.

Candidate/event ordering is frozen as:

1. ascending tile `(q, r)`;
2. within a tile, accepted `state.playerOrder` order.

Do not rely on object insertion order or `localeCompare`.

## 8. Resource demand grouping

Bank sufficiency is decided per resource type, across **all** unblocked tiles producing that resource for this roll.

For each resource, calculate:

- ordered candidate allocations;
- total demand;
- distinct entitled players with positive demand, in `playerOrder` order;
- available bank supply.

A player's demands from multiple matching tiles still make that player one distinct entitled player for the official shortage decision.

## 9. Exact bank-shortage rule

For each resource independently:

### Sufficient supply

If:

```text
bank supply >= total demand
```

then grant every candidate allocation in full.

### Insufficient supply, multiple entitled players

If:

```text
bank supply < total demand
and distinct entitled player count > 1
```

then grant **none** of that resource to anyone. Leave that resource's bank supply unchanged.

Emit one accepted `RESOURCE_PRODUCTION_BLOCKED` event for that resource with:

- reason `BANK_SHORTAGE`;
- every affected/entitled player exactly once;
- affected players in `playerOrder` order.

### Insufficient supply, one entitled player

If:

```text
bank supply < total demand
and distinct entitled player count == 1
```

then grant that one player as many cards as remain in the bank.

Allocate the partial supply across that player's candidate allocations in the frozen tile order. An allocation may therefore be partially granted. Emit no zero-quantity production event.

Set the bank supply for that resource to zero and emit one accepted `RESOURCE_PRODUCTION_BLOCKED` event identifying that player because some demand remained unmet.

### No demand

If total demand is zero, make no state change and emit no production or blocked event for that resource.

Bank resources must never become negative.

## 10. Production event order

For a non-`7` roll, the complete event order is:

```text
1. DICE_ROLLED
2. all granted RESOURCE_PRODUCED events, in tile (q,r) then playerOrder order
3. RESOURCE_PRODUCTION_BLOCKED events, in RESOURCE_TYPES order
```

Apply all bank/player transfers atomically within the one successful roll command.

The accepted internal `RESOURCE_PRODUCED` event remains one tile/player/resource/quantity allocation. Do not aggregate across different tiles.

# Frozen roll transitions

## 11. Non-seven roll

After a successful total other than `7`:

```text
turn.phase                    = ACTION
turn.lastRoll                 = exact DiceRoll
turn.currentPlayerId          = unchanged
turn.turnNumber               = unchanged
turn.setup                    = null
turn.developmentCardPlayedThisTurn = preserved
pendingDecision               = null
winnerId                      = unchanged/null
```

Only these state areas may change:

- `stateVersion`;
- `random`;
- `turn.phase` and `turn.lastRoll`;
- player resource bags that receive cards;
- bank resource counts that supply cards.

Board, occupancy, development deck/cards, awards, player order, identities/controllers, and game configuration data remain unchanged.

## 12. Rolled seven with required discards

A resource-card count is the sum of all five values in a player's authoritative `ResourceBag`. Development cards do not count.

For every player whose resource-card count is greater than seven:

```text
required discard = floor(resource-card count / 2)
```

If at least one player must discard:

- emit only the initial `DICE_ROLLED` event;
- produce no resources;
- do not move the robber;
- leave all hands and bank resources unchanged;
- set phase to `DISCARD_REQUIRED`;
- set the accepted `DISCARD_RESOURCES` pending-decision variant;
- identify the rolling/current player as the trigger;
- store the exact positive required counts for the affected players using the accepted Task 01 shape;
- start with no completed player IDs;
- preserve affected-player ordering deterministically according to `playerOrder` wherever the accepted contract exposes an order.

Do not implement `DISCARD_RESOURCES` command handling in this task.

## 13. Rolled seven without required discards

If no player has more than seven resource cards:

- emit only `DICE_ROLLED`;
- produce no resources;
- leave all hands and bank resources unchanged;
- set phase to `ROBBER_MOVE_REQUIRED`;
- set the accepted `MOVE_ROBBER` pending-decision variant for the rolling/current player;
- use the accepted robber cause representing `DICE_SEVEN`;
- do not move the robber and do not choose a target.

Do not implement `MOVE_ROBBER` or `STEAL_FROM_PLAYER` in this task.

For both seven branches:

```text
turn.lastRoll        = the exact total-seven DiceRoll
turn.currentPlayerId = unchanged
turn.turnNumber      = unchanged
turn.setup           = null
random               = post-two-dice random state
stateVersion         = previous + 1
```

# Frozen end-turn decisions

## 14. `END_TURN`

A successful `END_TURN` is legal only in `ACTION` with no pending decision and for the current actor.

Use `state.playerOrder` to find the current player and advance to the next clockwise player, wrapping from index `3` to index `0`.

The next `turnNumber` is the previous `turnNumber + 1`. In this project, `turnNumber` is a global one-based player-turn sequence, not a four-player round number.

The next turn is exactly:

```text
currentPlayerId                  = next clockwise player
turnNumber                       = previous + 1
phase                            = ROLL_REQUIRED
setup                            = null
lastRoll                         = null
developmentCardPlayedThisTurn    = false
pendingDecision                  = null
```

`END_TURN` consumes no random draw and changes no board, bank, hand, deck, card, award, or winner data.

Emit exactly, in this order:

```text
1. TURN_ENDED  for the outgoing player and old turn number
2. TURN_STARTED for the incoming player and new turn number
```

Victory/scoring checks are not implemented in this task because no Task 06 action can create a new victory point.

# Golden normal-turn replay

## 15. Golden starting state

Reconstruct the accepted Task 05 golden game and execute the exact accepted 16-command setup replay. Do not replace it with an unrelated hand-written state as the sole golden proof.

At the Task 06 starting boundary:

```text
stateVersion = 16
turnNumber   = 1
phase        = ROLL_REQUIRED
currentPlayerId = player:sentinel
random.state     = 3364541899
random.drawCount = 84
```

Player order:

```text
player:sentinel
player:human
player:merchant
player:builder
```

Starting resources:

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

Starting bank:

```text
LUMBER 19
BRICK  14
WOOL   18
GRAIN  17
ORE    19
```

## 16. Exact eight-command lifecycle replay

Execute these commands with any deterministic non-empty test command IDs:

```text
expected version 16  player:sentinel  ROLL_DICE
expected version 17  player:sentinel  END_TURN
expected version 18  player:human     ROLL_DICE
expected version 19  player:human     END_TURN
expected version 20  player:merchant  ROLL_DICE
expected version 21  player:merchant  END_TURN
expected version 22  player:builder   ROLL_DICE
expected version 23  player:builder   END_TURN
```

### Turn 1 — Sentinel

Raw unsigned draws and dice:

```text
3561776786 -> 3
1264537981 -> 2
dice = [3, 2]
total = 5
post-roll random = 1264537981 / 86
```

Production:

```text
tile:-1,-1  HILLS  -> player:builder  BRICK 1
```

### Turn 2 — Human

```text
2405734757 -> 6
2504974177 -> 2
dice = [6, 2]
total = 8
post-roll random = 2504974177 / 88
```

Production events in exact order:

```text
tile:-1,1  FIELDS -> player:sentinel  GRAIN 1
tile:-1,1  FIELDS -> player:human     GRAIN 1
tile:0,-1  FIELDS -> player:builder   GRAIN 2
```

The Builder quantity of two is one tile/player event aggregated from two adjacent settlements.

### Turn 3 — Merchant

```text
2600066608 -> 5
2261670735 -> 4
dice = [5, 4]
total = 9
post-roll random = 2261670735 / 90
```

Production events in exact order:

```text
tile:0,0  MOUNTAINS -> player:sentinel  ORE 1
tile:0,0  MOUNTAINS -> player:builder   ORE 1
```

The other number-9 tile has no adjacent occupied producing vertex and emits no event.

### Turn 4 — Builder

```text
4183043612 -> 3
3999636151 -> 2
dice = [3, 2]
total = 5
post-roll random = 3999636151 / 92
```

Production:

```text
tile:-1,-1  HILLS -> player:builder  BRICK 1
```

## 17. Exact final golden state

After all eight lifecycle commands:

```text
stateVersion = 24
turnNumber   = 5
phase        = ROLL_REQUIRED
currentPlayerId = player:sentinel
lastRoll     = null
setup        = null
pendingDecision = null
winnerId     = null

random.state     = 3999636151
random.drawCount = 92
```

Final player resources:

```text
player:human
  LUMBER 0, BRICK 1, WOOL 1, GRAIN 2, ORE 0

player:merchant
  LUMBER 0, BRICK 1, WOOL 0, GRAIN 0, ORE 0

player:builder
  LUMBER 0, BRICK 4, WOOL 0, GRAIN 3, ORE 1

player:sentinel
  LUMBER 0, BRICK 1, WOOL 0, GRAIN 1, ORE 1
```

Final bank:

```text
LUMBER 19
BRICK  12
WOOL   18
GRAIN  13
ORE    17
```

Development deck, board, occupancy, awards, player order, and all identity/controller data are unchanged from the accepted Task 05 completed setup state.

Across the eight commands, event totals are exactly:

```text
DICE_ROLLED       4
RESOURCE_PRODUCED 7
TURN_ENDED        4
TURN_STARTED      4
```

Total:

```text
19 events
```

There are no blocked-production events in this golden replay.

# Frozen seven fixtures

## 18. Controlled total-seven random anchor

For focused tests, clone the accepted completed Task 05 golden setup state and replace only its valid random numeric cursor with:

```text
algorithm = XORSHIFT32_V1
seed      = preserve the existing non-empty seed
state     = 259
drawCount = 84
```

The exact next roll is:

```text
70009715 -> 6
68079378 -> 1
dice = [6, 1]
total = 7
final random = 68079378 / 86
```

This is an explicitly synthetic valid random-state seam used to exercise the seven branch. It is not asserted to be reachable from the Task 05 seed at draw 84.

## 19. Seven with no discards

Using the ordinary Task 05 completed setup hands, every player has at most seven cards.

After the controlled total-seven roll:

```text
stateVersion = 17
phase = ROBBER_MOVE_REQUIRED
current player remains player:sentinel
turnNumber remains 1
lastRoll is [6,1] total 7
pending decision is accepted MOVE_ROBBER with cause DICE_SEVEN
random = 68079378 / 86
```

Exactly one event is emitted:

```text
DICE_ROLLED
```

No resource/bank/board/deck/award value changes.

## 20. Seven with required discards

Create a separate balanced synthetic hand/bank fixture from the completed Task 05 state:

```text
player:sentinel -> LUMBER 8                       total 8  discard 4
player:human    -> BRICK 9                        total 9  discard 4
player:merchant -> WOOL 7                         total 7  discard 0
player:builder  -> GRAIN 12                       total 12 discard 6

bank:
LUMBER 11
BRICK  10
WOOL   12
GRAIN   7
ORE    19
```

All unspecified resource values in those player bags are zero. Per-resource bank-plus-player totals remain 19.

After the same controlled total-seven roll:

```text
phase = DISCARD_REQUIRED
required positive counts:
  player:sentinel 4
  player:human    4
  player:builder  6
completed player IDs = empty
triggering/rolling player = player:sentinel
```

Player resources and bank remain exactly unchanged until Task 07 executes discard commands. Exactly one `DICE_ROLLED` event is emitted.

# Normal-turn state integrity

## 21. Focused invariant checks

Implement focused normal-turn integrity checks sufficient to reject corrupted authoritative data before a lifecycle command. Reuse accepted focused validators where appropriate; do not create a speculative persistence-validation framework.

At minimum reject with an actionable `Error`:

- schema/ruleset mismatch;
- player order not exactly four unique IDs present in `players`;
- current player absent from players/order;
- setup data non-null in a normal-turn phase;
- `turnNumber` not a positive safe integer;
- `stateVersion` not a non-negative safe integer;
- `ROLL_REQUIRED` with non-null `lastRoll`;
- `ACTION` with null `lastRoll`;
- `ACTION` with a total-seven `lastRoll`;
- `DISCARD_REQUIRED` without the accepted discard pending decision;
- `ROBBER_MOVE_REQUIRED` without the accepted move-robber pending decision;
- negative/non-integer bank or player resource values;
- unknown occupancy owner;
- numbered desert or producing tile with impossible content;
- winner non-null outside `GAME_OVER`, or `GAME_OVER` without a winner;
- a pending decision whose acting/triggering/affected player IDs are unknown where applicable.

The assertion must not mutate state.

Do not require `developmentCardPlayedThisTurn` to be false in `ROLL_REQUIRED`: future rules permit a development card to have been played before rolling. A roll preserves that flag; `END_TURN` resets it for the next player.

# Required focused source layout

Use focused files under existing domain directories. This layout is recommended and may be adjusted only for equivalent documented separation already present:

```text
src/game/
├── random/
│   ├── roll-dice.ts
│   └── roll-dice.test.ts
│
├── rules/
│   ├── resource-production.ts
│   └── resource-production.test.ts
│
└── engine/
    ├── normal-turn-lifecycle-engine.ts
    ├── normal-turn-invariants.ts
    ├── normal-turn-lifecycle-engine.test.ts
    └── normal-turn-invariants.test.ts
```

Small pure helpers may be added when each has one clear responsibility. Do not add barrel `index.ts` files, classes, generic reducer frameworks, or empty speculative files.

`src/game/**` must remain independent of React, MUI, Zustand, browser storage, application services, AI, and networking.

# Required tests

Use existing Vitest only. Add no dependency.

## Dice

1. `rollDice` uses the accepted random API and preserves first/second die order.
2. The frozen Task 05 post-setup random state produces `[3,2]`, total `5`, and `1264537981 / 86`.
3. The controlled state `259 / 84` produces `[6,1]`, total `7`, and `68079378 / 86`.
4. Input random state is not mutated and the returned state/roll are fresh serializable data.
5. No production source calls `Math.random()` or adds another entropy source.

## Normal production

6. A normal roll produces from every matching unblocked tile for every adjacent settlement/city.
7. A settlement yields one and a city yields two.
8. Same player/same tile quantities are aggregated into one event.
9. Different tiles remain separate events even for the same player/resource.
10. Robber tile produces nothing while another matching unblocked tile still produces.
11. Event order is dice, granted allocations by tile/player, then blocked resources in resource order.
12. Sufficient bank supply grants all and exactly conserves transferred cards.
13. Multi-player shortage grants nobody that resource, leaves its bank unchanged, and emits one ordered blocked event.
14. Single-player shortage grants all remaining supply in tile order, never goes negative, and emits one blocked event for unmet demand.
15. No-demand production emits no resource event and changes no bank/hand.
16. Invalid numbered desert, unknown owner, or invalid resource counts are rejected as invariant errors.

## Roll transitions

17. Successful non-seven roll increments state version once, updates random/last roll, and enters `ACTION`.
18. Seven with no affected hand enters `ROBBER_MOVE_REQUIRED` with accepted `DICE_SEVEN` pending decision and only a dice event.
19. Seven with the frozen `8/9/7/12` hand counts enters `DISCARD_REQUIRED` with exact `4/4/6` positive requirements and no transfer.
20. A roll preserves `developmentCardPlayedThisTurn`.

## End turn

21. `END_TURN` advances clockwise, increments the global turn number, resets phase/last roll/development-card flag, and consumes no randomness.
22. Wrapping Builder to Sentinel works exactly.
23. Events are exactly `TURN_ENDED`, then `TURN_STARTED`.
24. `ROLL_DICE` in `ACTION` and `END_TURN` in `ROLL_REQUIRED` return `WRONG_PHASE`.

## Validation, immutability, and replay

25. Stale version, unknown actor, game over, pending decision, and wrong actor follow the frozen precedence.
26. Failed commands leave state/envelope deeply unchanged and consume no random draw.
27. Representative corrupted normal-turn states throw actionable invariant errors.
28. The exact eight-command golden replay matches all dice, intermediate random anchors, production allocation order, final resources/bank, final turn, final random state, state version, and 19-event totals.
29. The development deck, board, occupancy, awards, player order, and identity/controller data remain unchanged through the golden replay.
30. All accepted Task 00–05 tests continue to pass.

Do not discover golden expected events by calling the production implementation itself to construct expectations.

# Documentation

Expected documentation changes:

1. Add this task file and its prompt under `tasks/`.
2. Narrowly update `docs/GAME_RULES.md` with:
   - two-die production;
   - robber blocking;
   - settlement/city yields;
   - exact bank-shortage rule;
   - rolled-seven transition without prematurely documenting unimplemented resolution behavior as complete.
3. Narrowly update `docs/ARCHITECTURE.md` with:
   - explicit dice random-state threading;
   - lifecycle-command boundary;
   - global turn-number semantics;
   - deterministic production/event ordering.
4. Add `docs/adr/ADR-0005-deterministic-dice-production-and-turn-lifecycle.md` recording:
   - accepted RNG reuse;
   - tile/player aggregation semantics;
   - bank-shortage decisions;
   - narrow lifecycle executor rather than a misleading incomplete generic router;
   - Task 07 boundary for discard/robber resolution.
5. Update the README current-status section only after all checks pass.

Do not rewrite unrelated UI, AI, trade, expansion, or multiplayer documentation.

# Forbidden work

Do not implement or add:

- changes to accepted Task 01 public contracts;
- changes to accepted Task 02 topology behavior;
- changes to accepted Task 03 SVG behavior/UI;
- changes to accepted Task 04 RNG/board generation behavior;
- changes to accepted Task 05 creation/setup behavior, except a behavior-preserving focused internal refactor if absolutely required and fully regression-tested;
- a complete generic game-command router;
- `DISCARD_RESOURCES` command execution;
- robber movement or stealing;
- paid roads, settlements, cities, piece costs, or legal build selectors;
- development-card purchase/play;
- trade of any kind;
- Longest Road, Largest Army, score, or victory calculation;
- `PlayerView` projection;
- AI, Zustand, gateway, persistence, routing, backend, networking, timers, animation, audio, or UI changes;
- an alternate/forced dice production API;
- `Math.random()`, Web Crypto randomness, UUIDs, timestamps, or hidden entropy;
- new npm dependencies;
- official CATAN artwork or copied rulebook text;
- a Git commit.

# Acceptance criteria

1. Dice results use only the accepted immutable RNG and match every frozen anchor.
2. A normal roll changes version exactly once and enters `ACTION` with deterministic production.
3. Production comes from authoritative board/building state, respects the robber, and aggregates same-player/same-tile yield.
4. Bank shortage behavior matches the frozen single-player and multi-player cases.
5. Event order and quantities are deterministic and exactly match state transfers.
6. A rolled seven creates the correct accepted pending decision without resolving it.
7. `END_TURN` advances clockwise, increments global turn number, resets turn-local fields, and consumes no RNG.
8. The complete eight-command golden replay reaches state version `24`, turn `5`, RNG `3999636151 / 92`, exact resource/bank balances, and exact 19-event totals.
9. Normal invalid moves return accepted violations; corrupt authoritative data throws actionable invariant errors.
10. All operations are immutable and plain-JSON compatible.
11. No accepted public contract, dependency, UI, setup behavior, or out-of-scope feature changes.
12. `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, `npm run check`, and `git diff --check` pass.
13. Completion report follows `AGENTS.md` and includes the additions below.

# Completion report additions

In addition to the normal `AGENTS.md` report, include:

- exact files created/changed;
- exact public dice and lifecycle-command APIs;
- exact validation precedence;
- exact dice draw order and all golden raw/die/random anchors;
- exact production aggregation, ordering, robber, and bank-shortage semantics;
- exact non-seven and seven phase transitions;
- exact eight-command golden replay final state/resources/bank/event totals;
- exact test-file/test totals and command results;
- confirmation that no accepted public contract or dependency changed;
- confirmation that no discard execution, robber movement, build, trade, development-card, award, scoring, AI, store, gateway, persistence, backend, networking, or UI feature was implemented;
- confirmation that no Git commit was created.
