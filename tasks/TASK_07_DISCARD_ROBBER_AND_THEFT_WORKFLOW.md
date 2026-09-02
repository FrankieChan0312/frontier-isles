# Task 07 — Discard, Robber Movement, Target Selection, and Random Theft

## Status

Ready for Codex implementation after Task 06 is accepted and committed as a clean checkpoint.

## Objective

Complete the pending-decision workflow created by a rolled total of `7`:

- execute exact resource discards for every affected player;
- return discarded resources to the bank;
- allow affected players to submit discards in any order without changing the rolling player;
- transition to robber movement only after every required discard is complete;
- validate and move the robber to a different land tile;
- derive eligible robbery targets from authoritative board occupancy and current resource-card counts;
- require an explicit target-selection command whenever at least one eligible target exists;
- steal one uniformly random resource card from the selected target using the accepted immutable RNG;
- resume the interrupted turn after the robber workflow completes;
- extend the accepted Task 06 normal-turn invariant so that a fully resolved total-seven turn may legally be in `ACTION` with a total-seven `lastRoll`;
- provide deterministic golden replay fixtures and focused corruption, legality, ordering, immutability, and RNG tests.

This task deliberately does **not** implement Knight-card play, normal building, trade, development-card purchase/effects, awards, victory, AI, player-view projection, stores, persistence, routing, backend, networking, or UI interaction.

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
11. `tasks/TASK_01_DOMAIN_CONTRACTS.md`
12. `tasks/TASK_02_STANDARD_BOARD_TOPOLOGY.md`
13. `tasks/TASK_04_SEEDED_STANDARD_BOARD_CONTENT.md`
14. The corrected and accepted `tasks/TASK_05_GAME_CREATION_AND_INITIAL_SETUP.md`
15. The accepted `tasks/TASK_06_DICE_PRODUCTION_AND_TURN_LIFECYCLE.md`
16. This task file

Inspect and reuse the accepted contracts and implementation. Do not duplicate or silently widen them.

## Preflight

1. Run `git status --short` and report the exact result.
2. The expected starting tree is clean except for the newly supplied Task 07 files under `tasks/`.
3. Run `npm run check` before changing production source. Stop and report a blocker if the accepted Task 06 baseline fails.
4. Confirm the accepted Task 06 controlled random seam:

```text
input random       = 259 / 84
rolled dice        = [6,1], total 7
post-roll random   = 68079378 / 86
```

5. Confirm the accepted Task 06 balanced discard fixture has exact positive requirements:

```text
player:sentinel 4
player:human    4
player:builder  6
```

6. Do not alter package versions or install dependencies.
7. Do not create a Git commit.

# Required public boundary

## 1. Narrow robber-workflow command API

Do not prematurely implement the complete future `execute(GameCommand)` router. Provide a narrow command boundary for only the pending-decision commands implemented by this task:

```ts
export type RobberWorkflowCommand = Extract<
  GameCommand,
  | { readonly type: "DISCARD_RESOURCES" }
  | { readonly type: "MOVE_ROBBER" }
  | { readonly type: "STEAL_FROM_PLAYER" }
>;

export type RobberWorkflowCommandEnvelope = Omit<
  CommandEnvelope,
  "command"
> & {
  readonly command: RobberWorkflowCommand;
};

export function executeRobberWorkflowCommand(
  state: GameState,
  envelope: RobberWorkflowCommandEnvelope,
): EngineResult;
```

Equivalent TypeScript syntax is permitted only when the exported semantics and narrow command union are identical.

The future full command router will compose the accepted setup, lifecycle, robber, build, development-card, and trade executors. Do not add a misleading incomplete generic router in this task.

## 2. Focused random-resource selector

Provide one pure helper in the game random/rules layer:

```ts
export function drawRandomResourceFromBag(
  resources: ResourceBag,
  random: RandomState,
): RandomResult<ResourceType>;
```

It must:

- validate that all five counts are non-negative safe integers;
- reject an empty bag with an actionable invariant `Error`;
- calculate the total card count;
- call accepted `nextRandomInt(random, 0, totalCardCount)` exactly once;
- interpret the selected zero-based card index in frozen `RESOURCE_TYPES` order;
- return the selected resource and the returned immutable random state;
- never mutate the bag or random state;
- consume a bounded random draw even when the target has exactly one card.

Do not add an injected callback, forced resource, separate seed, mutable deck, `Math.random()`, or alternate entropy source.

# Frozen workflow decisions

## 3. Command success/version/event rule

Every successful Task 07 command:

- increments `stateVersion` by exactly one;
- returns a fresh `GameState` graph;
- emits the exact event(s) specified below;
- does not mutate the supplied state or envelope.

A failed player command:

- returns the accepted failure branch;
- returns no state and no events;
- consumes no random draw;
- does not change `stateVersion`;
- leaves state and envelope deeply unchanged.

Corrupt authoritative state is an invariant/programmer error and must throw an actionable `Error`, not return a gameplay violation.

## 4. Shared validation precedence

Before command-specific payload validation, use this frozen precedence:

1. corrupted authoritative state -> throw actionable `Error`;
2. `expectedStateVersion !== state.stateVersion` -> `STALE_STATE_VERSION`;
3. actor ID absent from `state.players` -> `UNKNOWN_ACTOR`;
4. `winnerId !== null` or phase `GAME_OVER` -> `GAME_OVER`;
5. a non-null pending decision exists but it is not the decision required by this command -> `PENDING_DECISION_REQUIRED`;
6. no matching pending decision / command is not valid in the current phase -> `WRONG_PHASE`;
7. command-specific actor validation;
8. command-specific payload validation and invariant work.

Required matching pairs are:

```text
DISCARD_RESOURCES  -> phase DISCARD_REQUIRED       + pending kind DISCARD_RESOURCES
MOVE_ROBBER        -> phase ROBBER_MOVE_REQUIRED   + pending kind MOVE_ROBBER
STEAL_FROM_PLAYER  -> phase ROBBER_TARGET_REQUIRED + pending kind CHOOSE_ROBBER_TARGET
```

For `MOVE_ROBBER` and `STEAL_FROM_PLAYER`, an actor other than the pending acting player returns `NOT_YOUR_TURN` before tile/target validation.

For `DISCARD_RESOURCES`, affected players act outside ordinary turn ownership. Do **not** require `actorId === turn.currentPlayerId`. A player who is not currently required to discard, or who already completed the discard, receives `INVALID_DISCARD`.

# Discard workflow

## 5. Exact discard eligibility

While phase is `DISCARD_REQUIRED`:

- `turn.currentPlayerId` remains the player who rolled the seven;
- the accepted pending decision retains the triggering/rolling player;
- only player IDs with a positive required count and not present in `completedPlayerIds` may submit `DISCARD_RESOURCES`;
- eligible affected players may submit in any order;
- a completed player may not submit again;
- a player with no positive requirement may not submit a zero discard.

The implementation must not expose or require a temporary change of current player.

## 6. Exact discard-bag validation

The submitted `ResourceBag` must:

- contain valid non-negative safe-integer counts for all five accepted resource keys;
- sum to exactly that actor's frozen required-discard count;
- not exceed the actor's authoritative holdings for any resource.

Any mismatch returns `INVALID_DISCARD` with only serializable primitive details. Do not return `INSUFFICIENT_RESOURCES` for this pending-decision command; malformed, wrong-sized, repeated, or unaffordable discard selections are all `INVALID_DISCARD`.

Development cards do not count and cannot be discarded.

## 7. Discard state transfer and event

A successful discard:

1. subtracts each selected resource from that player;
2. adds each selected resource to the bank;
3. emits exactly one accepted `RESOURCES_DISCARDED` event containing the actor and exact discarded `ResourceBag`;
4. preserves random state, board, robber position, deck, awards, player order, current player, turn number, setup, last roll, development-card flag, and winner;
5. adds the actor to `completedPlayerIds` in canonical `playerOrder` order, not submission order, if more discards remain.

Resource counts must never be negative or exceed the accepted finite supply. Per-resource bank-plus-player conservation remains exactly 19.

## 8. Transition after each discard

If at least one required player remains incomplete:

```text
phase           = DISCARD_REQUIRED
pendingDecision = updated DISCARD_RESOURCES decision
```

If the successful command completes the final required discard:

```text
phase = ROBBER_MOVE_REQUIRED
pendingDecision = accepted MOVE_ROBBER decision
acting player = original triggering/rolling player
cause = DICE_SEVEN
```

Do not emit a separate transition event. The successful final-discard command still emits only its one `RESOURCES_DISCARDED` event.

The all-completed discard pending state is never persisted; reaching it without transitioning is a corrupted-state error.

# Robber movement

## 9. Legal robber tile

A successful `MOVE_ROBBER` command requires:

- the actor to be the accepted pending acting player;
- `tileId` to exist in authoritative topology;
- `tileId` to differ from `board.robberTileId`.

Any unknown tile or attempt to keep the robber on its current tile returns `INVALID_ROBBER_TILE`.

Every land tile, including the desert, may otherwise receive the robber. No adjacency restriction applies.

## 10. Eligible target derivation

After moving the robber, derive eligible targets from the authoritative post-move state.

A player is eligible exactly when all are true:

1. the player is not the acting player;
2. the player owns at least one `SETTLEMENT` or `CITY` on a vertex adjacent to the selected tile;
3. the player's current authoritative resource-card total is greater than zero.

Rules:

- roads do not create eligibility;
- development cards do not count;
- a player with several adjacent buildings appears only once;
- a zero-resource player is excluded even if adjacent;
- unknown occupancy owners are invariant errors;
- eligible IDs are explicitly ordered by accepted `state.playerOrder`;
- do not rely on object insertion order, `localeCompare`, SVG geometry, or branded-ID parsing.

## 11. Move event and target transition

A successful move always:

- updates `board.robberTileId`;
- emits exactly one accepted `ROBBER_MOVED` event with acting player, old tile, new tile, and the accepted cause;
- consumes no random draw.

If no eligible target exists:

```text
pendingDecision = null
phase = resume phase defined in section 14
```

No `RESOURCE_STOLEN` event is emitted.

If one or more eligible targets exist:

```text
phase = ROBBER_TARGET_REQUIRED
pendingDecision = accepted CHOOSE_ROBBER_TARGET decision
selected tile = new robber tile
eligible targets = exact canonical ordered list
cause = preserved accepted cause
```

Even when exactly one eligible target exists, the engine still enters `ROBBER_TARGET_REQUIRED` and requires an explicit `STEAL_FROM_PLAYER` command. This keeps target validation and random-state consumption in one stable command boundary. A future UI/AI may auto-submit that sole legal command, but the engine does not auto-steal during `MOVE_ROBBER`.

# Random theft

## 12. Legal target

A successful `STEAL_FROM_PLAYER` command requires:

- actor equals the pending acting player;
- `targetPlayerId` exists in the exact accepted pending eligible-target list;
- target is not the actor;
- the pending selected tile equals the current robber tile;
- the exact pending target list still equals a fresh authoritative derivation from the current board and hands.

An ineligible, unknown, self, zero-card, non-adjacent, or stale target returns `INVALID_ROBBER_TARGET`, except an unknown command actor still follows the earlier `UNKNOWN_ACTOR` precedence.

A corrupted pending eligible-target list is an invariant error, not a player violation.

## 13. Uniform random-card selection

The chosen target's cards are treated as one conceptual ordered multiset in exact `RESOURCE_TYPES` order:

```text
all LUMBER cards,
then all BRICK cards,
then all WOOL cards,
then all GRAIN cards,
then all ORE cards
```

Call `drawRandomResourceFromBag(target.resources, state.random)` once. Every physical resource card therefore has equal probability.

On success:

- decrement exactly one selected resource from the target;
- increment exactly one selected resource for the actor;
- leave bank resources unchanged;
- update authoritative random state to the helper's returned state;
- emit exactly one accepted `RESOURCE_STOLEN` event with exact from player, to player, and selected resource;
- clear `pendingDecision`;
- enter the resume phase defined below;
- preserve board, robber tile, turn number, current player, setup, last roll, development-card flag, deck, awards, and winner.

## 14. Resume phase

For the workflow created by Task 06's rolled seven:

```text
cause = DICE_SEVEN -> resume ACTION
```

This task does not create Knight-caused pending decisions or validate Knight ownership/play. However, the accepted robber-cause contract already includes `KNIGHT`, so the narrow resolver must preserve that cause and use this frozen future-compatible resume rule without adding a contract field:

```text
KNIGHT with turn.lastRoll == null -> ROLL_REQUIRED
KNIGHT with turn.lastRoll != null -> ACTION
```

This is pending-workflow resolution only; it is not implementation of the command that plays a Knight. Do not add a resume-phase field to accepted Task 01 contracts.

# Required Task 06 invariant extension

## 15. Total-seven ACTION is now a valid resolved state

Task 06 intentionally rejected:

```text
ACTION with a total-seven lastRoll
```

because Task 06 could create only an unresolved seven pending decision.

After Task 07 successfully finishes robber movement/theft, the correct state is:

```text
phase = ACTION
lastRoll.total = 7
pendingDecision = null
```

Therefore Task 07 must narrowly update the accepted normal-turn invariant and its tests:

- allow `ACTION` with total-seven `lastRoll` and null pending decision;
- continue to reject `ACTION` with any non-null pending decision;
- add exact validation for `ROBBER_TARGET_REQUIRED` with accepted `CHOOSE_ROBBER_TARGET` pending data;
- preserve all other accepted Task 06 lifecycle behavior;
- do not add an event-history field or a new public contract merely to prove that the workflow occurred.

Add an integration test proving that the accepted Task 06 `END_TURN` command succeeds after a Task 07-resolved seven, then advances clockwise, clears `lastRoll`, and consumes no additional random draw.

This narrow invariant extension is required planned behavior, not a Task 06 regression.

# Focused state integrity

## 16. Robber-workflow invariant requirements

Implement/reuse focused assertions sufficient to reject corrupted authoritative data before a Task 07 command. Do not build a speculative persistence framework.

At minimum reject with an actionable `Error`:

- every accepted Task 06 normal-turn corruption case that remains applicable;
- board robber tile absent from topology;
- `DISCARD_REQUIRED` without exact accepted discard pending decision;
- discard pending trigger/current-player mismatch for a rolled seven;
- discard requirement keys containing unknown players, non-positive/non-safe counts, or duplicate/impossible completed IDs;
- completed IDs not being a subset of required player IDs;
- all required players already completed while state still remains `DISCARD_REQUIRED`;
- `DISCARD_REQUIRED` without total-seven `lastRoll`;
- `ROBBER_MOVE_REQUIRED` without exact accepted move pending decision;
- Dice-seven move pending actor not equal to current/triggering player;
- `ROBBER_TARGET_REQUIRED` without exact accepted choose-target pending decision;
- selected target tile not equal to current robber tile;
- empty, duplicate, unknown, self, zero-card, non-adjacent, or incorrectly ordered eligible-target IDs;
- pending eligible-target list differing from a fresh authoritative derivation;
- negative/non-safe bank or player resource values;
- any per-resource bank-plus-player total other than 19;
- unknown building owner or invalid building kind on a vertex;
- winner/phase mismatch;
- invalid cause/player/card IDs according to existing accepted contracts where validation is possible without implementing development-card behavior.

Assertions must not mutate state.

# Frozen deterministic fixtures

## 17. Accepted controlled-seven starting seam

Start from the accepted completed Task 05 golden setup state:

```text
stateVersion     = 16
turnNumber       = 1
currentPlayerId  = player:sentinel
phase            = ROLL_REQUIRED
random           = 259 / 84   (synthetic controlled seam)
robberTileId     = tile:2,0
```

Use the accepted Task 06 balanced hand/bank fixture exactly:

```text
player:sentinel -> LUMBER 8                       total 8
player:human    -> BRICK 9                        total 9
player:merchant -> WOOL 7                         total 7
player:builder  -> GRAIN 12                       total 12

bank:
LUMBER 11
BRICK  10
WOOL   12
GRAIN   7
ORE    19
```

All unspecified resource values are zero. Per-resource bank-plus-player totals equal 19.

Execute accepted `ROLL_DICE`:

```text
dice             = [6,1], total 7
post-roll random = 68079378 / 86
stateVersion     = 17
phase            = DISCARD_REQUIRED
requirements:
  player:sentinel 4
  player:human    4
  player:builder  6
```

## 18. Frozen successful discard sequence

Submit successful discards deliberately out of player order:

```text
expected version 17
actor player:human
DISCARD_RESOURCES: BRICK 4

expected version 18
actor player:builder
DISCARD_RESOURCES: GRAIN 6

expected version 19
actor player:sentinel
DISCARD_RESOURCES: LUMBER 4
```

After the first command:

```text
completed IDs = [player:human]
phase = DISCARD_REQUIRED
```

After the second command, canonical completed-ID order is:

```text
[player:human, player:builder]
```

After the final command:

```text
stateVersion = 20
phase = ROBBER_MOVE_REQUIRED
pending acting player = player:sentinel
cause = DICE_SEVEN
random remains 68079378 / 86
```

Hands and bank are exactly:

```text
player:sentinel -> LUMBER 4
player:human    -> BRICK 5
player:merchant -> WOOL 7
player:builder  -> GRAIN 6

bank:
LUMBER 15
BRICK  14
WOOL   12
GRAIN  13
ORE    19
```

## 19. Frozen robber move and target order

At expected version `20`, execute:

```text
actor: player:sentinel
MOVE_ROBBER tile:0,-2
```

Accepted Task 05 occupancy/topology makes the exact eligible targets:

```text
player:merchant
player:builder
```

in accepted `playerOrder` order. The acting Sentinel is not eligible. Both targets have positive resource counts.

After movement:

```text
stateVersion     = 21
robberTileId     = tile:0,-2
phase            = ROBBER_TARGET_REQUIRED
pending targets  = [player:merchant, player:builder]
random           = 68079378 / 86
```

Emit exactly one `ROBBER_MOVED` event:

```text
from tile:2,0
to   tile:0,-2
actor player:sentinel
cause DICE_SEVEN
```

## 20. Frozen random theft anchor

At expected version `21`, execute:

```text
actor:  player:sentinel
STEAL_FROM_PLAYER target player:builder
```

Builder has exactly six `GRAIN` cards at this boundary.

The accepted RNG path is:

```text
input random uint state = 68079378 / 86
next raw uint32         = 1618009444
bounded range           = [0,6)
selected index          = 4
rejection draws         = 0
final random            = 1618009444 / 87
selected resource       = GRAIN
```

After theft:

```text
stateVersion     = 22
phase            = ACTION
pendingDecision  = null
currentPlayerId  = player:sentinel
turnNumber       = 1
lastRoll         = [6,1], total 7
robberTileId     = tile:0,-2
random           = 1618009444 / 87
```

Final hands:

```text
player:sentinel -> LUMBER 4, GRAIN 1
player:human    -> BRICK 5
player:merchant -> WOOL 7
player:builder  -> GRAIN 5
```

Final bank remains:

```text
LUMBER 15
BRICK  14
WOOL   12
GRAIN  13
ORE    19
```

Across the complete six-command controlled workflow (`ROLL_DICE`, three discards, move, steal), exact event totals are:

```text
DICE_ROLLED         1
RESOURCES_DISCARDED 3
ROBBER_MOVED        1
RESOURCE_STOLEN     1
Total               6
```

## 21. Independent multi-resource random-selection anchor

Test `drawRandomResourceFromBag` independently with:

```text
resources:
LUMBER 2
BRICK  1
WOOL   1
GRAIN  1
ORE    1

total = 6
random = 68079378 / 86
raw = 1618009444
index = 4
selected = GRAIN
final random = 1618009444 / 87
```

The conceptual ordered cards are:

```text
0 LUMBER
1 LUMBER
2 BRICK
3 WOOL
4 GRAIN
5 ORE
```

Do not construct test expectations by calling the production selector itself.

## 22. No-target and one-target anchors

Using accepted Task 05 setup occupancy and the ordinary no-discard controlled-seven state:

- moving from `tile:2,0` to `tile:1,-2` has no eligible target and must enter `ACTION` directly, with no random draw;
- moving from `tile:2,0` to `tile:-2,2` has exactly one eligible target, `player:human`, and must still enter `ROBBER_TARGET_REQUIRED` rather than auto-stealing.

# Required source layout

Use focused files under existing game directories. The following layout is recommended and may be adjusted only for equivalent documented separation already present:

```text
src/game/
├── random/
│   ├── draw-random-resource.ts
│   └── draw-random-resource.test.ts
│
├── rules/
│   ├── discard-rules.ts
│   ├── robber-target-rules.ts
│   ├── discard-rules.test.ts
│   └── robber-target-rules.test.ts
│
└── engine/
    ├── robber-workflow-engine.ts
    ├── robber-workflow-invariants.ts
    ├── robber-workflow-engine.test.ts
    └── robber-workflow-invariants.test.ts
```

A focused update to the accepted Task 06 files is expected:

```text
src/game/engine/normal-turn-invariants.ts
src/game/engine/normal-turn-invariants.test.ts
```

Small pure helpers may be added when each has one clear responsibility. Do not add barrel `index.ts` files, classes, generic reducer frameworks, or empty speculative files.

`src/game/**` must remain independent of React, MUI, Zustand, browser storage, application services, AI, and networking.

# Required tests

Use existing Vitest only. Add no dependency.

## Random resource selection

1. Exact multi-resource anchor selects `GRAIN` at index `4` and final random `1618009444 / 87`.
2. Every resource card is represented in canonical `RESOURCE_TYPES` cumulative order.
3. A one-card bag selects its sole resource and still consumes the accepted bounded random draw.
4. Empty, negative, fractional, unsafe, or malformed bags throw actionable invariant errors.
5. Input bag/random are not mutated and returned data are plain JSON-compatible.
6. No production source calls `Math.random()` or introduces another entropy source.

## Discards

7. An affected non-current player may discard successfully.
8. Discard actors may submit in arbitrary order.
9. `completedPlayerIds` remain in canonical `playerOrder` order.
10. Exact selected cards transfer from hand to bank with one exact private discard event.
11. Wrong total, negative/fractional values, missing/extra resource shape at runtime, unaffordable selection, non-required actor, and repeated actor return `INVALID_DISCARD`.
12. Outstanding discards preserve `DISCARD_REQUIRED`; the final discard transitions to `ROBBER_MOVE_REQUIRED` for the original rolling player.
13. Failed discard commands preserve state/envelope/random/version.
14. Resource conservation remains exactly 19 per type.

## Robber movement and target derivation

15. Moving to current tile or unknown tile returns `INVALID_ROBBER_TILE`.
16. Wrong actor returns `NOT_YOUR_TURN` before tile validation.
17. Legal move updates only robber/workflow/version fields, emits one move event, and consumes no RNG.
18. Target derivation excludes actor, roads-only owners, and zero-card players.
19. Multiple buildings for one opponent deduplicate to one target.
20. Target IDs are ordered by `playerOrder`.
21. No-target move resumes `ACTION` immediately.
22. Exactly one target still requires explicit `STEAL_FROM_PLAYER`.
23. Multiple-target anchor for `tile:0,-2` is exactly Merchant then Builder.

## Theft

24. Ineligible, self, unknown, zero-card, non-adjacent, or non-pending target returns `INVALID_ROBBER_TARGET` under the frozen precedence.
25. Successful theft transfers exactly one selected card, preserves bank, emits one exact private event, clears pending, and resumes the turn.
26. Failed theft consumes no RNG and mutates nothing.
27. A corrupted pending target list throws an actionable invariant error.
28. The golden Builder theft consumes exactly one bounded draw and steals `GRAIN`.

## Integration and invariants

29. Representative discard/move/target corruption cases throw actionable invariant errors.
30. `ACTION` with a total-seven `lastRoll` and null pending is accepted after resolution.
31. `ROBBER_TARGET_REQUIRED` requires exact coherent choose-target pending state.
32. Accepted lifecycle `END_TURN` succeeds after resolved seven, advances clockwise, clears last roll, increments version/turn, and consumes no RNG.
33. Synthetic accepted `KNIGHT`-cause pending states resume `ROLL_REQUIRED` when `lastRoll` is null and `ACTION` when it is non-null, without implementing Knight play.
34. The exact six-command golden workflow reaches version `22`, random `1618009444 / 87`, exact hands/bank/robber/phase, and six-event totals.
35. Board topology/content other than robber position, occupancy, development deck/cards, awards, identities/controllers, and player order remain unchanged through the golden workflow.
36. All accepted Task 00–06 tests continue to pass.

# Documentation

Expected documentation changes:

1. Add this task file and its prompt under `tasks/`.
2. Narrowly update `docs/GAME_RULES.md` with:
   - exact discard-half rule already initiated by a seven;
   - affected players may submit in any order in the digital workflow;
   - discarded cards return to supply;
   - robber must move to a different tile;
   - eligible robbery target definition;
   - uniform random resource theft;
   - no-target behavior.
3. Narrowly update `docs/ARCHITECTURE.md` with:
   - discard/move/target pending-state transitions;
   - non-current affected-player command handling;
   - immutable random-state threading for theft;
   - resolved-seven `ACTION` state;
   - explicit target command even for one eligible player.
4. Add `docs/adr/ADR-0006-discard-robber-and-random-theft-workflow.md` recording:
   - arbitrary discard submission order with canonical stored ordering;
   - separate move and steal commands;
   - authoritative target derivation;
   - one-card target still consumes RNG;
   - Task 06 invariant extension for `ACTION + total 7`.
5. Update README current status only after all checks pass.

Do not rewrite unrelated UI, AI, trade, expansion, or multiplayer documentation.

# Forbidden work

Do not implement or add:

- changes to accepted Task 01 public contracts;
- changes to accepted Task 02 topology behavior;
- changes to accepted Task 03 SVG/UI;
- changes to accepted Task 04 RNG or board generation;
- changes to accepted Task 05 creation/setup behavior;
- changes to accepted Task 06 dice/production/end-turn behavior except the narrowly required invariant extension and integration tests;
- a complete generic game-command router;
- normal paid roads, settlements, cities, costs, or legal build selectors;
- Knight-card play or any other development-card purchase/effect;
- player or maritime trade;
- Longest Road, Largest Army, score, or victory calculation;
- `PlayerView` projection or event redaction;
- AI, Zustand, gateway, persistence, routing, backend, networking, timers, animation, audio, or UI changes;
- auto-steal inside `MOVE_ROBBER`;
- hidden target selection or peeking at development cards;
- `Math.random()`, Web Crypto randomness, UUIDs, timestamps, or hidden entropy;
- new npm dependencies;
- official CATAN artwork or copied rulebook text;
- a Git commit.

# Acceptance criteria

1. Exact valid discards transfer selected cards to the bank and complete in any actor order.
2. The final discard transitions to robber movement for the original rolling player.
3. Robber moves only to a different valid tile and consumes no RNG.
4. Eligible targets derive exactly from adjacent opponent buildings and positive current resource-card counts.
5. One or more eligible targets require explicit target selection; no target resumes the turn immediately.
6. Theft selects uniformly among physical resource cards using accepted immutable RNG and transfers exactly one card.
7. Every successful command changes version exactly once; failed commands are immutable and consume no RNG.
8. Resolved total-seven state is legally `ACTION` with `lastRoll.total === 7` and null pending decision.
9. Existing `END_TURN` works immediately after a resolved seven.
10. Exact golden workflow reaches version `22`, random `1618009444 / 87`, robber `tile:0,-2`, exact final hands/bank, and six event totals.
11. Corrupt authoritative data throws; ordinary illegal player choices return accepted violations under frozen precedence.
12. All returned values remain plain JSON-compatible and no accepted public contract/dependency changes.
13. `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, `npm run check`, and `git diff --check` pass.
14. Completion report follows `AGENTS.md` and the additions below.

# Completion report additions

In addition to the normal `AGENTS.md` report, include:

- exact files created/changed;
- exact narrow robber-workflow and random-selector public APIs;
- exact validation precedence and the special discard actor rule;
- exact discard validation, transfer, ordering, and final transition semantics;
- exact target derivation and no-target/one-target/multiple-target behavior;
- exact random theft algorithm and raw/bounded/random anchors;
- exact Task 06 invariant extension;
- exact six-command golden workflow state/resources/bank/events;
- exact test-file/test totals and command results;
- confirmation that no accepted contract/dependency changed;
- confirmation that no build, trade, development-card play, award, scoring, PlayerView, AI, store, gateway, persistence, backend, networking, or UI feature was implemented;
- confirmation that no Git commit was created.
