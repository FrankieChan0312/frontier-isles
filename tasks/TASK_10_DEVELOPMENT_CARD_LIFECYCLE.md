# Task 10 — Development-Card Purchase, Play, Effects, and Free-Road Lifecycle

## Status

Ready for Codex implementation after Task 09 is accepted and committed as a clean checkpoint.

## Objective

Implement the complete authoritative Base Game development-card lifecycle using the accepted Task 01 contracts and Task 05 standard deck:

- purchase any number of development cards during `ACTION` while the player can pay and the deck is non-empty;
- draw exactly the top card at bank deck index `0` without consuming RNG;
- enforce one non-Victory-Point development card per own turn;
- prohibit playing a non-Victory-Point card on the turn it was acquired;
- allow eligible non-Victory-Point cards before the production roll or during `ACTION`;
- execute Knight through the accepted Task 07 robber workflow;
- execute Road Building through two-or-fewer free `BUILD_ROAD` commands without resource payment;
- execute Invention through an explicit two-resource pending choice;
- execute Monopoly through an explicit resource-type pending choice;
- preserve hidden Victory Point cards and reveal them automatically only through the accepted Task 09 victory resolver;
- integrate Largest Army, Longest Road, current-player victory, event ordering, invariants, deterministic state/version behaviour, and regression tests.

This task deliberately does **not** implement domestic trade, maritime trade, a generic command router, `PlayerView`, legal-action projection, AI, Zustand, gateways, persistence, backend, networking, deployment, or UI changes.

## Rule authority fixed for this task

The repository ruleset uses these Base Game semantics:

1. A development card costs one Wool, one Grain, and one Ore.
2. A player may buy multiple development cards during their `ACTION` phase while able to pay and while cards remain in the deck.
3. A player may play at most one non-Victory-Point development card during their own turn.
4. A non-Victory-Point card may not be played during the same turn in which it was bought.
5. An eligible non-Victory-Point card may be played before rolling or during the `ACTION` phase.
6. A Knight moves the robber and permits the accepted robber-target/theft workflow, but it does not trigger seven-card discards.
7. Road Building permits up to two legal road placements without paying Lumber or Brick, subject to normal connectivity and piece limits.
8. Invention transfers exactly two available resource cards from the bank; both may be the same type.
9. Monopoly transfers every card of one named resource from all opponents to the acting player; an effect that collects zero cards is still legal.
10. Victory Point cards are never played through `PLAY_DEVELOPMENT_CARD`. They remain hidden while in hand and are revealed automatically when the accepted scoring resolver determines that the current player has reached the victory target.
11. The same-turn Victory Point exception is implemented by scoring immediately after a purchase: a newly bought Victory Point card may therefore cause an immediate win.
12. A Knight that grants Largest Army completes its robber effect before victory is finalized. Largest Army changes on card play; `GAME_WON`, when applicable, is emitted only after the Knight robber workflow has resolved.

Do not silently substitute house rules.

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
12. `docs/adr/ADR-0007-authoritative-paid-building-actions.md`
13. `docs/adr/ADR-0008-derived-scoring-and-current-turn-victory.md`
14. `tasks/TASK_01_DOMAIN_CONTRACTS.md`
15. `tasks/TASK_05_GAME_CREATION_AND_INITIAL_SETUP.md`
16. `tasks/TASK_06_DICE_PRODUCTION_AND_TURN_LIFECYCLE.md`
17. `tasks/TASK_07_DISCARD_ROBBER_AND_THEFT_WORKFLOW.md`
18. `tasks/TASK_08_PAID_BUILDING_ACTIONS.md`
19. `tasks/TASK_09_AWARDS_SCORING_AND_VICTORY.md`
20. This task file

Inspect and reuse the accepted deck source, resource-payment helpers, road rules, piece counts, robber workflow, scoring reconciliation, and test helpers. Do not duplicate accepted responsibilities.

## Preflight

1. Run `git status --short` and report the exact result.
2. The expected starting tree is clean except for the two newly supplied Task 10 files under `tasks/`.
3. Run `npm run check` before changing production source.
4. Confirm the accepted Task 09 baseline reports 30 test files and 213 passing tests.
5. Confirm Task 09 scoring still rejects `VICTORY_POINT + PLAYED` and derives hidden/revealed points correctly.
6. Confirm Task 07 resolves Knight-caused robber workflows to the phase implied by `turn.lastRoll`.
7. Do not install dependencies or change package versions.
8. Do not create a Git commit.

# Frozen constants and public APIs

## 1. Standard development-card cost

Export an immutable cost with these exact values:

```text
LUMBER 0
BRICK  0
WOOL   1
GRAIN  1
ORE    1
```

A suitable public name is:

```ts
export const STANDARD_DEVELOPMENT_CARD_COST: ResourceBag;
```

Reuse the accepted resource-payment boundary. Do not hand-code a second transfer implementation.

## 2. Narrow Task 10 command boundary

Provide a narrow exported command type equivalent to:

```ts
export type DevelopmentCardLifecycleCommand = Extract<
  GameCommand,
  | { readonly type: "BUY_DEVELOPMENT_CARD" }
  | { readonly type: "PLAY_DEVELOPMENT_CARD" }
  | { readonly type: "CHOOSE_INVENTION_RESOURCES" }
  | { readonly type: "CHOOSE_MONOPOLY_RESOURCE" }
  | { readonly type: "BUILD_ROAD" }
  | { readonly type: "FINISH_FREE_ROAD_PLACEMENT" }
>;

export type DevelopmentCardLifecycleCommandEnvelope = Omit<
  CommandEnvelope,
  "command"
> & {
  readonly command: DevelopmentCardLifecycleCommand;
};

export function executeDevelopmentCardLifecycleCommand(
  state: GameState,
  envelope: DevelopmentCardLifecycleCommandEnvelope,
): EngineResult;
```

Equivalent naming is permitted only when the exported responsibility remains one narrow Task 10 lifecycle boundary.

Do not add a generic `executeGameCommand` router in this task. Task 12 will compose the accepted narrow executors.

## 3. Focused pure helpers

Provide clear, testable helpers for at least these responsibilities, using established repository naming conventions:

- development-card ownership lookup;
- action-card playability;
- card-status replacement without mutation;
- conversion from `DevelopmentCardDefinition` to `OwnedDevelopmentCard`;
- legal free-road edge derivation or validation;
- phase resumption after a card effect;
- Invention selection validation and bank transfer;
- Monopoly transfer in canonical player order;
- development-card state invariants.

Do not expose UI-oriented English text or mutable collections.

# Card-state invariants

## 4. Exact card conservation and identity

For every authoritative state accepted by the Task 10 executor:

- every standard development-card ID exists exactly once across the bank deck and all player collections;
- the global total is exactly 25;
- no card ID appears twice;
- every ID maps to the exact type defined by the accepted standard source deck;
- bank cards are `DevelopmentCardDefinition` values and have no status/acquired turn;
- owned cards contain an integer `acquiredTurnNumber` and one accepted status;
- no owned card has an acquired turn later than `state.turn.turnNumber`;
- all card objects and arrays are plain JSON-compatible data;
- no ID is parsed to infer card type.

Corrupt authoritative card state throws an actionable `Error` before gameplay validation.

## 5. Status and Knight-count invariants

Allowed status combinations are exactly:

```text
KNIGHT          IN_HAND | PLAYED
ROAD_BUILDING   IN_HAND | PLAYED
MONOPOLY        IN_HAND | PLAYED
INVENTION       IN_HAND | PLAYED
VICTORY_POINT   IN_HAND | REVEALED
```

Reject:

```text
VICTORY_POINT + PLAYED
non-VP card + REVEALED
```

For every player:

```text
player.playedKnights
=
number of owned KNIGHT cards whose status is PLAYED
```

Do not infer the turn on which an old card was played; the accepted model intentionally stores only `acquiredTurnNumber` and the current-turn boolean.

## 6. Pending-decision coherence

Require:

- `PLACE_FREE_ROADS` refers to a `PLAYED` Road Building card owned by its acting player and phase `FREE_ROAD_PLACEMENT`;
- `CHOOSE_INVENTION_RESOURCES` refers to a `PLAYED` Invention card owned by its acting player;
- `CHOOSE_MONOPOLY_RESOURCE` refers to a `PLAYED` Monopoly card owned by its acting player;
- a Knight `MOVE_ROBBER`/`CHOOSE_ROBBER_TARGET` cause refers to a `PLAYED` Knight owned by the acting player;
- the pending acting player is the current player for all Task 10 card effects;
- Invention and Monopoly pending choices retain the phase from which the card was played: `ROLL_REQUIRED` when `lastRoll === null`, otherwise `ACTION`;
- no Task 10 pending effect coexists with `GAME_OVER` or a non-null winner.

# Shared command semantics

## 7. Success, failure, version, event, and RNG rules

Every successful Task 10 command:

- increments `stateVersion` by exactly one;
- returns a fresh immutable state graph;
- emits only the events explicitly permitted below;
- preserves the supplied envelope;
- consumes no RNG.

The only later RNG consumption associated with a Task 10 card is a Knight theft performed by the accepted Task 07 workflow.

A failed player command:

- returns the accepted failure branch;
- returns no state/events;
- consumes no RNG;
- does not change the version;
- leaves state and envelope deeply unchanged.

Corrupt authoritative state throws an actionable `Error` rather than returning a gameplay violation.

## 8. Shared validation precedence

For `BUY_DEVELOPMENT_CARD` and `PLAY_DEVELOPMENT_CARD`, use:

1. corrupt authoritative state -> throw `Error`;
2. stale version -> `STALE_STATE_VERSION`;
3. unknown actor -> `UNKNOWN_ACTOR`;
4. completed game -> `GAME_OVER`;
5. any non-null pending decision -> `PENDING_DECISION_REQUIRED`;
6. non-current actor -> `NOT_YOUR_TURN`;
7. invalid phase -> `WRONG_PHASE`;
8. command-specific validation.

For pending-effect commands, use:

1. corrupt authoritative state -> throw `Error`;
2. stale version -> `STALE_STATE_VERSION`;
3. unknown actor -> `UNKNOWN_ACTOR`;
4. completed game -> `GAME_OVER`;
5. non-null pending decision of a different kind -> `PENDING_DECISION_REQUIRED`;
6. no matching pending decision or incoherent phase -> `WRONG_PHASE`;
7. actor differs from the pending acting player -> `NOT_YOUR_TURN`;
8. command-specific payload/rule validation.

Matching pairs are:

```text
CHOOSE_INVENTION_RESOURCES -> pending CHOOSE_INVENTION_RESOURCES
CHOOSE_MONOPOLY_RESOURCE   -> pending CHOOSE_MONOPOLY_RESOURCE
BUILD_ROAD                  -> phase FREE_ROAD_PLACEMENT + pending PLACE_FREE_ROADS
FINISH_FREE_ROAD_PLACEMENT  -> phase FREE_ROAD_PLACEMENT + pending PLACE_FREE_ROADS
```

# Purchase lifecycle

## 9. `BUY_DEVELOPMENT_CARD`

It is legal only during `ACTION`.

After shared validation, command-specific precedence is:

1. empty bank deck -> `DEVELOPMENT_DECK_EMPTY`;
2. inability to pay the exact standard cost -> `INSUFFICIENT_RESOURCES`.

On success:

1. take the card at `bank.developmentDeck[0]`;
2. remove exactly that first definition from the deck;
3. create a fresh owned card with the same ID/type, `acquiredTurnNumber = turn.turnNumber`, and `status = IN_HAND`;
4. append it to the current player's development-card collection without reordering existing cards;
5. transfer one Wool, one Grain, and one Ore from player to bank;
6. preserve `developmentCardPlayedThisTurn`;
7. emit exactly one accepted `DEVELOPMENT_CARD_BOUGHT` event;
8. run accepted award/current-player victory reconciliation;
9. when the purchase creates a win through one or more hidden Victory Point cards, reveal all winning player's in-hand Victory Point cards and emit `GAME_WON` after the bought event.

No shuffle or random draw occurs during purchase.

A player may execute this command repeatedly in the same `ACTION` phase while legal.

# General playability

## 10. `PLAY_DEVELOPMENT_CARD`

It is legal only in:

```text
ROLL_REQUIRED
ACTION
```

After shared validation, command-specific precedence is:

1. card ID not in actor collection -> `DEVELOPMENT_CARD_NOT_OWNED`;
2. status is not `IN_HAND` -> `DEVELOPMENT_CARD_NOT_PLAYABLE`;
3. card type is `VICTORY_POINT` -> `DEVELOPMENT_CARD_NOT_PLAYABLE`;
4. `acquiredTurnNumber >= turn.turnNumber` -> `DEVELOPMENT_CARD_NOT_PLAYABLE`;
5. `developmentCardPlayedThisTurn === true` -> `DEVELOPMENT_CARD_LIMIT_REACHED`;
6. card-specific precondition failure -> `DEVELOPMENT_CARD_NOT_PLAYABLE`.

On every successful non-VP play:

- set that card's status to `PLAYED`;
- set `developmentCardPlayedThisTurn = true`;
- emit `DEVELOPMENT_CARD_PLAYED` before any award event;
- preserve resources unless the card effect later changes them;
- preserve RNG at the play-command boundary.

The same-turn restriction is based on the global accepted `turnNumber`. A card bought on an earlier turn is eligible when its owner next receives a turn.

# Knight

## 11. Knight play and robber integration

Playing a Knight:

1. applies the general play mutation;
2. increments `player.playedKnights` by exactly one;
3. changes phase to `ROBBER_MOVE_REQUIRED`;
4. creates accepted `MOVE_ROBBER` pending data with:
   - acting player = current player;
   - cause = `KNIGHT`;
   - exact played card ID;
5. reconciles awards, allowing Largest Army to change immediately;
6. emits events in exact order:

```text
DEVELOPMENT_CARD_PLAYED
LARGEST_ARMY_CHANGED, only if changed
```

No seven-card discard occurs.

Do not resolve current-player victory on the initial Knight play command. Modify the accepted Task 07 completion boundary narrowly so that:

- a Knight workflow with no eligible target resolves victory after `ROBBER_MOVED`;
- a Knight workflow with a target resolves victory after `RESOURCE_STOLEN`;
- any resulting `GAME_WON` is the last event of the final robber command;
- dice-seven robber workflows do not gain new scoring behaviour beyond accepted Task 07 semantics;
- after a non-winning Knight effect, the accepted phase resumption remains:
  - `ROLL_REQUIRED` when the Knight was played before rolling;
  - `ACTION` when it was played after a resolved roll.

If Largest Army raises the acting player to 10, the card's robber effect therefore completes before `GAME_WON`.

# Road Building

## 12. Starting the free-road effect

Playing Road Building requires, at play time:

- at least one remaining road piece below the accepted limit of 15;
- at least one legal road edge using normal road target/connectivity/blocking rules, ignoring affordability.

Otherwise return `DEVELOPMENT_CARD_NOT_PLAYABLE`.

On success:

1. apply the general play mutation;
2. change phase to `FREE_ROAD_PLACEMENT`;
3. create accepted `PLACE_FREE_ROADS` pending data with:

```text
remaining = min(2, 15 - current owned road count)
```

4. emit only `DEVELOPMENT_CARD_PLAYED`.

Resources and bank remain unchanged.

## 13. Free `BUILD_ROAD`

During matching `PLACE_FREE_ROADS` pending state, `BUILD_ROAD`:

- reuses normal road target, occupancy, connectivity, blocking, and piece-limit rules;
- does not check or deduct Lumber/Brick;
- returns the same accepted road violations (`ILLEGAL_EDGE`, `ROAD_BLOCKED`, `ROAD_NOT_CONNECTED`, `INSUFFICIENT_PIECES`) under the frozen rule order;
- places a road whose event source is exactly `ROAD_BUILDING_CARD`;
- decrements the pending remaining count by one;
- when remaining becomes zero, clears pending and resumes:
  - `ROLL_REQUIRED` if `lastRoll === null`;
  - `ACTION` otherwise;
- reconciles awards after each placed road;
- resolves current-player victory after each placed road using this exact pending-safe order:
  1. apply the road and calculate the decremented remaining count;
  2. reconcile awards on the updated board;
  3. derive the current player's actual score using the reconciled awards;
  4. if the score is at least 10, clear the free-road pending decision, then invoke the accepted current-player victory resolver so the state becomes `GAME_OVER`;
  5. otherwise retain/decrement or complete the pending effect normally;
- if the first free road causes a win, clear pending and do not require/place a second road.

Do not call the stable-boundary victory resolver while the free-road pending decision is still non-null; clear the pending effect first only when the road has actually created a winning score.

Event order for one free road is:

```text
ROAD_BUILT
LONGEST_ROAD_CHANGED, if changed
LARGEST_ARMY_CHANGED, if changed (normally absent)
GAME_WON, if won
```

No development-card-play event is repeated on the road command.

## 14. `FINISH_FREE_ROAD_PLACEMENT`

This command is permitted only when:

- the matching pending effect has `remaining === 1`; and
- no legal second free-road placement currently exists.

It is a dead-end completion command, not a voluntary waiver while a legal second road remains. If `remaining === 2`, or if at least one legal free-road edge still exists, return `DEVELOPMENT_CARD_NOT_PLAYABLE`.

On success:

- clear pending;
- resume `ROLL_REQUIRED` when `lastRoll === null`, otherwise `ACTION`;
- emit no event;
- consume no RNG;
- preserve resources, board, awards, and score.

This command still increments `stateVersion` once.

# Invention

## 15. Starting and resolving Invention

Playing Invention requires the bank to contain at least two resource cards in total. If fewer than two exist, return `DEVELOPMENT_CARD_NOT_PLAYABLE` rather than creating an impossible pending choice.

On successful play:

- apply the general play mutation;
- keep the origin phase (`ROLL_REQUIRED` or `ACTION`);
- create accepted `CHOOSE_INVENTION_RESOURCES` pending data with the acting player and card ID;
- emit only `DEVELOPMENT_CARD_PLAYED`.

`CHOOSE_INVENTION_RESOURCES` must submit a runtime-valid `ResourceBag` that:

- has non-negative safe-integer values for all five resources;
- sums to exactly two;
- does not request more of any resource than the bank contains.

The two resources may be identical.

Failures:

- malformed or wrong-total bag -> `DEVELOPMENT_CARD_NOT_PLAYABLE`;
- insufficient requested bank supply -> `BANK_RESOURCE_UNAVAILABLE`.

On success:

- transfer exactly the selected two cards from bank to player;
- clear pending;
- retain the origin phase already present in `turn.phase`;
- emit no additional event;
- preserve RNG.

# Monopoly

## 16. Starting and resolving Monopoly

Playing Monopoly has no resource-availability precondition.

On successful play:

- apply the general play mutation;
- keep the origin phase (`ROLL_REQUIRED` or `ACTION`);
- create accepted `CHOOSE_MONOPOLY_RESOURCE` pending data with acting player and card ID;
- emit only `DEVELOPMENT_CARD_PLAYED`.

`CHOOSE_MONOPOLY_RESOURCE`:

1. validates that the payload is one accepted `ResourceType` at runtime;
2. visits opponents in exact `playerOrder` order, skipping the acting player;
3. removes every card of the selected resource from every opponent;
4. adds the total to the acting player;
5. leaves the bank unchanged;
6. permits a zero-card result;
7. clears pending and retains the origin phase;
8. emits no additional event;
9. consumes no RNG.

A malformed runtime resource value returns `DEVELOPMENT_CARD_NOT_PLAYABLE`.

# Victory Point cards

## 17. Hidden and revealed Victory Point lifecycle

Do not implement a separate reveal command.

- `PLAY_DEVELOPMENT_CARD` targeting a Victory Point card always returns `DEVELOPMENT_CARD_NOT_PLAYABLE`.
- An in-hand Victory Point card remains hidden while actual score is below the target.
- Existing Task 09 reconciliation reveals every in-hand Victory Point card belonging to the winner.
- Run that reconciliation after `BUY_DEVELOPMENT_CARD` so a newly purchased Victory Point card can legally complete a win during the same turn.
- Preserve the existing Task 09 behaviour that building, award changes, or turn start may also reveal all winning Victory Point cards.
- Victory Point revelation does not set `developmentCardPlayedThisTurn` and does not consume the one-card allowance.

# Deterministic fixtures and required anchors

## 18. Purchase fixture

Base the fixture on the accepted Task 08 starting `ACTION` boundary:

```text
stateVersion = 17
turnNumber   = 1
current      = player:sentinel
phase        = ACTION
lastRoll     = [3,2], total 5
random       = 1264537981 / 86
```

Use the accepted resource-conserving Task 08 rebalance:

```text
Sentinel: L3 B3 W1 G3 O3
Bank:     L16 B11 W17 G14 O16
```

The accepted Task 05 deck top is:

```text
development-card:victory-point:03
```

After one `BUY_DEVELOPMENT_CARD`:

```text
stateVersion = 18
phase/current/turn/lastRoll unchanged
random       = 1264537981 / 86
bank deck length = 24
new deck top = development-card:knight:09
```

Sentinel resources:

```text
L3 B3 W0 G2 O2
```

Bank resources:

```text
L16 B11 W18 G15 O17
```

Owned card:

```text
id                 = development-card:victory-point:03
type               = VICTORY_POINT
acquiredTurnNumber = 1
status             = IN_HAND
```

Events:

```text
DEVELOPMENT_CARD_BOUGHT 1
```

No win occurs in this ordinary fixture.

## 19. Same-turn Victory Point purchase win

Construct an invariant-valid current-player state with:

- `ACTION` phase;
- 9 actual victory points before purchase;
- top deck card `development-card:victory-point:03`;
- exact purchase resources available;
- no pending decision and no winner.

After purchase:

```text
stateVersion += 1
winnerId      = current player
phase         = GAME_OVER
new VP status = REVEALED
actual/public score = 10
```

Events must be:

```text
DEVELOPMENT_CARD_BOUGHT
GAME_WON
```

The current-turn development-card-play flag is unchanged.

## 20. Road Building golden lifecycle

Base this fixture on the accepted Task 08 final state:

```text
stateVersion = 21
phase        = ACTION
current      = player:sentinel
random       = 1264537981 / 86
Sentinel resources = all zero
Bank resources = L19 B14 W18 G17 O19
Sentinel roads = 4
Sentinel settlements = 2
Sentinel cities = 1
```

Move the exact standard card:

```text
development-card:road-building:01
```

from the bank deck into Sentinel's collection as `IN_HAND`, acquired on an earlier turn. Preserve global card conservation. Use an invariant-valid current turn later than the acquisition turn.

Commands and targets:

```text
v21 PLAY_DEVELOPMENT_CARD development-card:road-building:01
v22 BUILD_ROAD edge:vertex:2,-1,-1|vertex:4,-2,-2
v23 BUILD_ROAD edge:vertex:4,-2,-2|vertex:5,-4,-1
```

Final:

```text
stateVersion = 24
phase        = ACTION
pending      = null
card status  = PLAYED
developmentCardPlayedThisTurn = true
Sentinel roads = 6
Longest Road length = 5
Longest Road holder = player:sentinel
Sentinel actual/public VP = 6
resources and bank unchanged
random = 1264537981 / 86
```

Combined events:

```text
DEVELOPMENT_CARD_PLAYED 1
ROAD_BUILT              2
LONGEST_ROAD_CHANGED    1
```

The two road events use source `ROAD_BUILDING_CARD`.

## 21. Knight/Largest-Army victory integration

Construct an invariant-valid current-player fixture with:

- 8 actual/public VP before Largest Army;
- two previously played Knights;
- one eligible in-hand Knight acquired on an earlier turn;
- no current Largest Army holder;
- a valid destination tile with no eligible robbery target;
- either `ROLL_REQUIRED` or `ACTION`, explicitly test both phase-resumption paths in focused tests.

On `PLAY_DEVELOPMENT_CARD`:

```text
playedKnights = 3
Largest Army holder = current player
phase = ROBBER_MOVE_REQUIRED
pending cause = KNIGHT with exact card ID
winner remains null
```

Events:

```text
DEVELOPMENT_CARD_PLAYED
LARGEST_ARMY_CHANGED
```

After the accepted `MOVE_ROBBER` command to the no-target tile:

```text
phase    = GAME_OVER
winnerId = current player
pending  = null
actual/public score = 10
```

Events for the move command:

```text
ROBBER_MOVED
GAME_WON
```

No RNG draw occurs because there is no theft.

Also test a target/theft path where `GAME_WON` follows `RESOURCE_STOLEN` and the one accepted theft draw.

## 22. Invention fixture

Use an invariant-valid current-player state with an eligible earlier-turn Invention card and at least two Ore in the bank.

Commands:

```text
PLAY_DEVELOPMENT_CARD
CHOOSE_INVENTION_RESOURCES { ORE: 2, all others: 0 }
```

Expected:

- two command-level version increments;
- card becomes `PLAYED` on the first command;
- matching pending exists only between commands;
- player receives two Ore and bank loses two Ore;
- origin phase is restored/retained;
- RNG unchanged;
- only one event across the two commands: `DEVELOPMENT_CARD_PLAYED`.

## 23. Monopoly fixture

Use an invariant-valid current-player state where the three opponents hold the selected resource in canonical order as:

```text
2, 3, 1
```

After play plus resource choice:

- current player gains 6;
- every opponent has 0 of that resource;
- bank is unchanged;
- two version increments occur;
- origin phase is retained;
- RNG unchanged;
- only the initial `DEVELOPMENT_CARD_PLAYED` event is emitted.

Also test a legal zero-card Monopoly result.

# Required tests

## 24. Minimum focused coverage

Add tests for at least:

### Inventory and invariants

- exact 25-card conservation across bank and players;
- duplicate/missing/unknown/mismatched IDs;
- illegal type/status combinations;
- future acquired turn;
- `playedKnights` mismatch;
- malformed pending card references;
- plain JSON serialization and immutability.

### Purchase

- exact cost and atomic transfer;
- top-at-index-zero draw;
- unlimited repeated purchases while legal;
- deck empty precedence;
- insufficient-resource failure;
- hidden ordinary VP purchase;
- same-turn VP purchase victory and event order;
- no RNG consumption.

### General play

- legal before roll and in `ACTION`;
- wrong phases;
- unknown/non-owned card;
- already played/revealed card;
- same-turn acquisition rejection;
- one-card-per-turn limit;
- VP cannot use `PLAY_DEVELOPMENT_CARD`;
- failed commands preserve all data.

### Knight

- no discard workflow;
- played count/status/flag;
- Largest Army event order;
- before-roll and after-roll phase resumption;
- no-target victory after `ROBBER_MOVED`;
- targeted victory after `RESOURCE_STOLEN`;
- dice-seven Task 07 regression unchanged.

### Road Building

- play preconditions;
- remaining count `1 | 2` from piece supply;
- free road costs zero;
- normal road connectivity/blocking violations;
- first and second placement transitions;
- `FINISH_FREE_ROAD_PLACEMENT` rejected at remaining 2, rejected when a legal second road remains, and accepted at remaining 1 only when no legal second edge exists;
- Longest Road and victory reconciliation after each placement;
- first-road win cancels pending second road;
- exact golden edges/events;
- no RNG consumption.

### Invention

- same/different resource selections;
- exactly-two validation;
- malformed/negative/fractional values;
- bank shortage;
- fewer-than-two-total-bank play precondition;
- phase/pending transition;
- conservation and no RNG.

### Monopoly

- canonical all-opponent transfer;
- bank unchanged;
- zero-card result;
- invalid runtime resource;
- phase/pending transition;
- conservation and no RNG.

### Regression

- Task 05 create/setup golden replay unchanged;
- Task 06 lifecycle golden replay unchanged;
- Task 07 robber workflow unchanged except specified Knight victory completion;
- Task 08 paid-building replay unchanged;
- Task 09 awards/scoring/victory tests unchanged.

# Documentation and ADR

## 25. Required documentation changes

Update:

- `docs/GAME_RULES.md` with purchase timing, one-per-turn, same-turn restriction, every card effect, and VP exception;
- `docs/ARCHITECTURE.md` with the Task 10 narrow executor, pending effects, free-road routing boundary, and Knight-to-Task-07 integration;
- `README.md` progress/current capabilities.

Add one ADR documenting:

- development cards remain authoritative owned records rather than being removed from state;
- action cards use `PLAYED`, VP cards use `REVEALED`;
- card choices use accepted pending decisions;
- Road Building reuses `BUILD_ROAD` in `FREE_ROAD_PLACEMENT` without payment;
- scoring is reconciled after purchase/free roads and after Knight effect completion;
- effect-resolution commands may validly emit zero events because Task 01 froze the exact event union.

Do not rewrite unrelated documents.

# Forbidden scope

Do not implement:

- domestic or maritime trade;
- trade pending decisions;
- generic command router;
- `PlayerView` implementation;
- legal-action projections for UI/AI;
- AI or AI memory;
- Zustand/application stores;
- local save/load;
- gateway interfaces or implementations;
- React/MUI/SVG changes;
- backend, WebSocket, database, Firebase, networking, or deployment;
- new event discriminants or new RuleViolation codes;
- new fields in `GameState`, `PlayerState`, `TurnState`, `PendingDecision`, or accepted Task 01 contracts;
- `Math.random()`, Web Crypto, UUIDs, timestamps, or hidden entropy;
- package/dependency changes;
- Git commits.

# Completion commands

Before finishing, run:

```text
npm run typecheck
npm run lint
npm run test
npm run build
npm run check
git diff --check
```

Also audit production `src/game/**` for forbidden entropy.

# Completion report

Return:

1. Files created or changed.
2. Public APIs and pure helpers.
3. Card-state invariants.
4. Purchase behaviour and exact validation precedence.
5. General playability and one-card-per-turn behaviour.
6. Knight, Road Building, Invention, Monopoly, and Victory Point behaviour.
7. Golden fixture results and exact event ordering.
8. Tests added and final repository totals.
9. Exact output/results of every required command.
10. Dependencies added, or confirmation that none changed.
11. Deviations, blockers, or unresolved questions.
12. Explicit confirmation that no out-of-scope feature was implemented.
13. Explicit confirmation that no Git commit was created.

# Acceptance criteria

Task 10 is accepted only when:

- all five standard development-card types have the frozen lifecycle;
- purchase and every effect use accepted contracts without widening them;
- same-turn and one-per-turn rules are exact;
- Road Building is free but otherwise authoritative;
- Knight integrates with Task 07 and Largest Army/Task 09 correctly;
- VP purchase can win immediately without using the play allowance;
- all command successes increment version once and all failures are immutable;
- RNG changes only during accepted random theft;
- all old and new tests pass;
- no dependencies or out-of-scope features are added;
- no Git commit is created.
