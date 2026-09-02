# Task 09 — Longest Road, Largest Army, Victory-Point Scoring, and Game Completion

## Status

Ready for Codex implementation after Task 08 is accepted and committed as a clean checkpoint.

## Objective

Implement the authoritative, deterministic scoring layer for the Base 4-player ruleset:

- exact Longest Road length calculation;
- Longest Road holder acquisition, retention, transfer, and removal;
- Largest Army holder acquisition, retention, and transfer from `playedKnights`;
- public and actual victory-point derivation;
- hidden/revealed Victory Point development-card treatment;
- current-player-only victory resolution at 10 or more points;
- automatic Victory Point card revelation for the winner;
- integration with paid building and turn start;
- exact award and game-won events;
- invariant, graph, tie, interruption, score, victory, immutability, and regression tests.

This task deliberately does **not** implement buying or playing development cards, Knight robber execution, Road Building free roads, trade, AI, PlayerView projection, legal-action selectors, stores, gateways, persistence, backend, networking, or UI changes.

## Rule authority fixed for this task

The repository ruleset uses these Base Game semantics:

1. Longest Road requires a continuous, opponent-uninterrupted route of at least five road pieces.
2. A circular six-road route counts as six.
3. The owner's own settlement/city does not interrupt its road; another player's building does.
4. A current Longest Road holder retains the award when tied for the greatest qualifying length.
5. If an interrupted former holder no longer qualifies, a unique qualifying leader receives the award; if no player or multiple non-holder players tie for the lead, the award has no holder.
6. Largest Army requires at least three **played** Knights. Unplayed Knight cards do not count. A challenger must strictly exceed the current holder; a tie leaves the current holder unchanged.
7. A player wins immediately upon having at least 10 actual victory points during that player's own turn. A player who already has 10 when their turn begins wins without rolling.
8. Hidden Victory Point development cards count toward actual victory points but not public victory points. On winning, all of the winner's in-hand Victory Point cards are revealed.

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
13. `tasks/TASK_01_DOMAIN_CONTRACTS.md`
14. `tasks/TASK_02_STANDARD_BOARD_TOPOLOGY.md`
15. `tasks/TASK_04_SEEDED_STANDARD_BOARD_CONTENT.md`
16. The corrected and accepted `tasks/TASK_05_GAME_CREATION_AND_INITIAL_SETUP.md`
17. `tasks/TASK_06_DICE_PRODUCTION_AND_TURN_LIFECYCLE.md`
18. `tasks/TASK_07_DISCARD_ROBBER_AND_THEFT_WORKFLOW.md`
19. `tasks/TASK_08_PAID_BUILDING_ACTIONS.md`
20. This task file

Inspect and reuse accepted topology, occupancy, piece-count, development-card, paid-building, and turn-lifecycle helpers. Do not duplicate accepted responsibilities.

## Preflight

1. Run `git status --short` and report the exact result.
2. The expected starting tree is clean except for the two newly supplied Task 09 files under `tasks/`.
3. Run `npm run check` before changing production source.
4. Confirm the accepted Task 08 baseline reports 27 test files and 190 passing tests.
5. Confirm the Task 08 four-command golden replay still has no award or win event.
6. Do not install dependencies or change package versions.
7. Do not create a Git commit.

# Frozen constants and public APIs

## 1. Standard scoring constants

Export readonly constants with these exact values:

```text
LONGEST_ROAD_MINIMUM_LENGTH = 5
LARGEST_ARMY_MINIMUM_KNIGHTS = 3
LONGEST_ROAD_VICTORY_POINTS  = 2
LARGEST_ARMY_VICTORY_POINTS  = 2
SETTLEMENT_VICTORY_POINTS    = 1
CITY_VICTORY_POINTS          = 2
VICTORY_POINT_CARD_POINTS    = 1
STANDARD_VICTORY_POINT_TARGET = 10
```

Do not add them to `GameState`; they belong to the frozen ruleset implementation.

## 2. Required scoring contracts

Provide an exported plain-data score breakdown equivalent to:

```ts
export interface PlayerScoreBreakdown {
  readonly playerId: PlayerId;
  readonly settlementVictoryPoints: number;
  readonly cityVictoryPoints: number;
  readonly longestRoadVictoryPoints: number;
  readonly largestArmyVictoryPoints: number;
  readonly revealedVictoryPointCardPoints: number;
  readonly hiddenVictoryPointCardPoints: number;
  readonly publicVictoryPoints: number;
  readonly actualVictoryPoints: number;
}
```

Provide public pure functions with these responsibilities and names unless an accepted repository naming convention requires a narrowly documented equivalent:

```ts
export function deriveLongestRoadLength(
  board: BoardState,
  playerId: PlayerId,
): number;

export function derivePlayerScore(
  state: GameState,
  playerId: PlayerId,
): PlayerScoreBreakdown;

export function derivePublicVictoryPoints(
  state: GameState,
  playerId: PlayerId,
): number;

export function deriveActualVictoryPoints(
  state: GameState,
  playerId: PlayerId,
): number;
```

Provide an internal/exported reconciliation boundary usable by Task 08 now and Task 10 later. An equivalent explicit type is:

```ts
export interface ScoringReconciliationResult {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

export function reconcileAwardsAndCurrentPlayerVictory(
  state: GameState,
): ScoringReconciliationResult;
```

This helper does not increment `stateVersion`, consume RNG, or create a command. The calling command executor owns the single command-level version increment.

A narrower `reconcileAwards` and/or `resolveCurrentPlayerVictory` helper may also be exported when useful for focused tests. Do not create a generic command router.

# Longest Road

## 3. Authoritative graph meaning

Longest Road is derived only from:

- accepted `BoardTopology` vertices and edges;
- current `edgeOccupancy` road ownership;
- current `vertexOccupancy` buildings.

It must never use:

- total road-piece count as a shortcut;
- event history;
- array insertion order;
- SVG geometry;
- coordinates parsed from branded IDs;
- cached length stored in `GameState` or `PlayerState`.

A candidate route is an edge trail:

- every counted edge is occupied by the selected player's road;
- an edge may be used at most once in one candidate route;
- branches require selecting the best continuous trail rather than summing every branch;
- a vertex can participate in a loop traversal when reached through unused edges;
- arriving at a vertex occupied by another player's settlement/city ends that direction immediately;
- the route may terminate at such an opponent-occupied vertex and still count the edge used to arrive there;
- the player's own settlement/city does not interrupt traversal;
- disconnected components are evaluated independently and the maximum is returned.

The standard board has at most 15 roads per player, so a clear exhaustive depth-first edge-trail search is acceptable. Prefer correctness and testability over premature memoization.

Traversal of incident edges must use deterministic code-unit-sorted edge IDs even though only the resulting length is public.

## 4. Required independent Longest Road anchors

Use independently frozen edge fixtures rather than deriving expected targets from the production selector.

### Five-edge chain

```text
edge:vertex:-1,-1,2|vertex:-2,1,1
edge:vertex:-1,2,-1|vertex:-2,1,1
edge:vertex:-1,2,-1|vertex:1,1,-2
edge:vertex:1,1,-2|vertex:2,-1,-1
edge:vertex:1,-2,1|vertex:2,-1,-1
```

Expected length: `5`.

### Central six-edge loop

The six cyclic edges around `tile:0,0` are:

```text
edge:vertex:1,1,-2|vertex:2,-1,-1
edge:vertex:-1,2,-1|vertex:1,1,-2
edge:vertex:-1,2,-1|vertex:-2,1,1
edge:vertex:-1,-1,2|vertex:-2,1,1
edge:vertex:-1,-1,2|vertex:1,-2,1
edge:vertex:1,-2,1|vertex:2,-1,-1
```

Expected length: `6`.

### Branch behaviour

Construct a Y-shaped owned network with six total roads and three two-edge arms. Expected Longest Road is `4`, not `6`.

### Opponent interruption

On the frozen five-edge chain, place another player's settlement at:

```text
vertex:-1,2,-1
```

The route splits into lengths `2` and `3`; expected Longest Road is `3`.

Placing the selected player's own settlement/city at the same vertex leaves the expected length at `5`.

# Award reconciliation

## 5. Longest Road holder rule

Compute every player's current length in exact `playerOrder` order.

Let `maximumLength` be the greatest derived length. A qualifying player has length at least `5` and equal to `maximumLength`.

Determine the next holder exactly as follows:

1. If the current holder is non-null, still has at least five, and is tied for or alone at the greatest length, retain that holder.
2. Otherwise, if exactly one player is the qualifying leader, assign that player.
3. Otherwise assign `null`.

Examples that must be tested:

- no player reaches five -> no holder;
- one player reaches five -> that player receives it;
- no current holder and two players tie at five -> no holder;
- current holder ties a challenger at the greatest qualifying length -> current holder retains;
- challenger becomes strictly longer -> transfer to challenger;
- interrupted holder drops below the unique qualifying leader -> transfer;
- interrupted holder drops out and two other players tie for the lead -> remove the award to `null`.

Emit one accepted `LONGEST_ROAD_CHANGED` event only when the holder ID actually changes. Use the accepted previous/new holder payload unchanged.

## 6. Largest Army holder rule

Largest Army is derived exclusively from `PlayerState.playedKnights`.

- minimum qualifying count is `3`;
- unplayed Knight cards do not count;
- a current holder tied at the greatest qualifying count retains the award;
- a challenger must have a strictly greater count to take it;
- with no current holder, exactly one qualifying leader receives it;
- with no current holder and a tie for the qualifying lead, holder remains `null`.

Although `playedKnights` cannot normally decrease, reconciliation and invariant tests must still handle malformed or synthetic persisted states deterministically.

Emit one accepted `LARGEST_ARMY_CHANGED` event only when the holder changes.

## 7. Award event order

When one reconciliation call changes both awards, event order is always:

```text
LONGEST_ROAD_CHANGED
LARGEST_ARMY_CHANGED
```

No award event is emitted when the holder is unchanged, including retained ties.

# Victory-point derivation

## 8. Building and award points

For each player:

```text
owned SETTLEMENT = 1 point
owned CITY       = 2 points
Longest Road holder = 2 points
Largest Army holder = 2 points
```

Counts and ownership are derived from authoritative board occupancy and `AwardState`; do not duplicate a score field in authoritative state.

## 9. Victory Point development cards

Only cards whose type is `VICTORY_POINT` score.

- status `IN_HAND`: one hidden point; included in actual score only;
- status `REVEALED`: one revealed point; included in both public and actual score;
- status `PLAYED`: invalid for a Victory Point card and rejected by scoring invariants;
- non-Victory-Point card types score zero regardless of status.

Therefore:

```text
publicVictoryPoints
  = building points
  + award points
  + revealed Victory Point cards

actualVictoryPoints
  = publicVictoryPoints
  + hidden in-hand Victory Point cards
```

Do not reveal another player's hidden Victory Point cards when calculating scores.

# Victory resolution

## 10. Current player only

A winner is resolved only for `turn.currentPlayerId` and only during that player's own turn.

At a stable boundary with `pendingDecision === null`, if the current player's actual score is at least `10`:

1. change every in-hand Victory Point card owned by that player from `IN_HAND` to `REVEALED`;
2. preserve card IDs, card types, order, and `acquiredTurnNumber`;
3. set `winnerId` to the current player;
4. set `turn.phase` to `GAME_OVER`;
5. keep current player, turn number, last roll, and `developmentCardPlayedThisTurn` unchanged;
6. emit exactly one accepted `GAME_WON` event last, containing the actual final point total;
7. consume no RNG and do not increment `stateVersion` inside the helper.

Do not emit `DEVELOPMENT_CARD_PLAYED` when revealing Victory Point cards.

A non-current player may have 10 or more actual points without winning yet. The first qualifying player whose own turn begins wins at that boundary.

## 11. Scoring reconciliation order

`reconcileAwardsAndCurrentPlayerVictory(state)` uses this exact order:

1. derive and reconcile Longest Road;
2. derive and reconcile Largest Army;
3. emit award changes in the frozen order;
4. calculate the current player's actual score using the reconciled awards;
5. resolve and emit `GAME_WON` last if eligible.

The returned state has the same `stateVersion` and `RandomState` as the supplied state.

# Integration boundaries

## 12. Paid building integration

Narrowly extend accepted `executePaidBuildingCommand`:

1. preserve all Task 08 validation and payment precedence;
2. apply the successful road/settlement/city update;
3. increment `stateVersion` exactly once as already accepted;
4. create the accepted build event first;
5. reconcile awards and current-player victory on the updated state;
6. append award events and then `GAME_WON`, when present.

A successful build may therefore now emit more than one event. This is an intentional Task 09 evolution of Task 08; it must not alter failed-command behaviour.

Exact event order examples:

```text
ROAD_BUILT
LONGEST_ROAD_CHANGED
GAME_WON
```

or:

```text
SETTLEMENT_BUILT
LONGEST_ROAD_CHANGED
```

or:

```text
CITY_BUILT
GAME_WON
```

The accepted Task 08 four-command golden replay still emits exactly its original four build events because no player reaches a qualifying road length or 10 points in that replay.

A paid settlement can interrupt another player's route. Award reconciliation must examine all four players, not only the acting player.

## 13. Turn-start victory integration

Narrowly extend the accepted `END_TURN` success path in `executeNormalTurnLifecycleCommand`:

1. retain accepted version, clockwise, turn-number, reset, and no-RNG behaviour;
2. emit `TURN_ENDED`;
3. emit `TURN_STARTED` for the next player;
4. resolve victory for the new current player without recalculating unchanged awards;
5. if eligible, append `GAME_WON`, reveal that player's in-hand Victory Point cards, and leave the resulting state in `GAME_OVER`.

The full event order is:

```text
TURN_ENDED
TURN_STARTED
GAME_WON
```

The whole `END_TURN` command still increments `stateVersion` exactly once.

All accepted Task 06 end-turn fixtures where the next player has fewer than 10 points remain unchanged and still emit only `TURN_ENDED`, then `TURN_STARTED`.

Do not add a `DECLARE_VICTORY` or `START_GAME` command.

# State integrity

## 14. Scoring and award invariants

Implement or compose non-mutating assertions sufficient to reject at least:

- negative, fractional, or unsafe-integer `playedKnights`;
- award holder ID not present in `players`;
- non-null Longest Road holder with length below five;
- non-null Longest Road holder strictly beaten by another player's length;
- non-null Largest Army holder with fewer than three played Knights;
- non-null Largest Army holder strictly beaten by another player's count;
- a `VICTORY_POINT` card with status `PLAYED`;
- duplicate development-card IDs across bank/player ownership, using accepted card integrity where already available;
- `winnerId` absent from players;
- `winnerId !== null` while phase is not `GAME_OVER`;
- phase `GAME_OVER` while `winnerId === null`;
- a winner different from `turn.currentPlayerId`;
- a winner with fewer than 10 actual points;
- unrevealed in-hand Victory Point cards still owned by the winner;
- a game-over state with a non-null pending decision.

For compatibility with focused pre-command fixtures, a `null` award holder is structurally permitted even when a unique player currently qualifies. Successful scoring-affecting commands must reconcile it before returning. A non-null holder, however, must never be structurally impossible under the rules above.

Do not require event history in order to validate current authoritative state.

# Exact golden fixtures

## 15. Golden Longest Road acquisition replay

Construct the accepted Task 08 final golden state through the real accepted helpers and commands. It begins this task boundary at:

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
awards.longestRoadHolderId = null
awards.largestArmyHolderId = null
```

Task 08 final Sentinel occupancy includes four total roads, but its longest continuous route is only three.

Apply a test-only conservation-preserving transfer of two Lumber and two Brick from the bank to Sentinel:

```text
Sentinel start: LUMBER 2, BRICK 2, WOOL 0, GRAIN 0, ORE 0
Bank start:     LUMBER 17, BRICK 12, WOOL 18, GRAIN 17, ORE 19
```

Execute:

```text
expected version 21
player:sentinel BUILD_ROAD
edge:vertex:2,-1,-1|vertex:4,-2,-2

expected version 22
player:sentinel BUILD_ROAD
edge:vertex:4,-2,-2|vertex:5,-4,-1
```

After the first road:

```text
stateVersion = 22
Sentinel total roads = 5
Sentinel Longest Road length = 4
longestRoadHolderId = null
Events: ROAD_BUILT only
```

After the second road:

```text
stateVersion = 23
Sentinel total roads = 6
Sentinel Longest Road length = 5
longestRoadHolderId = player:sentinel
Sentinel publicVictoryPoints = 6
Sentinel actualVictoryPoints = 6
random remains 1264537981 / 86
Sentinel resources are all zero
Bank = L19 B14 W18 G17 O19
```

Exact combined event sequence:

```text
ROAD_BUILT
ROAD_BUILT
LONGEST_ROAD_CHANGED previous=null new=player:sentinel
```

No `GAME_WON` event occurs.

## 16. Golden paid-city victory replay

Clone the accepted state after section 15 without changing its version or RNG, then make a clearly test-only structurally valid scoring fixture:

- convert Sentinel's settlement at `vertex:-1,-1,2` to a city;
- convert Sentinel's settlement at `vertex:-4,-4,8` to a city;
- keep Sentinel's existing city at `vertex:2,-1,-1`;
- place a Sentinel settlement at `vertex:5,-4,-1` at the endpoint of its accepted road;
- keep Longest Road holder as Sentinel;
- transfer exactly 2 Grain and 3 Ore from the bank to Sentinel.

Before the command:

```text
stateVersion = 23
Sentinel buildings = 3 cities + 1 settlement
building points = 7
Longest Road points = 2
publicVictoryPoints = 9
actualVictoryPoints = 9
Sentinel resources = GRAIN 2, ORE 3, all others 0
Bank = L19 B14 W18 G15 O16
```

Execute:

```text
expected version 23
player:sentinel UPGRADE_CITY
vertex:5,-4,-1
```

Expected result:

```text
stateVersion       = 24
turnNumber         = 1
currentPlayerId    = player:sentinel
phase              = GAME_OVER
winnerId           = player:sentinel
pendingDecision    = null
random              = 1264537981 / 86
Sentinel buildings = 4 cities, 0 settlements
publicVictoryPoints = 10
actualVictoryPoints = 10
Sentinel resources all zero
Bank = L19 B14 W18 G17 O19
```

Exact event order:

```text
CITY_BUILT
GAME_WON player=player:sentinel victoryPoints=10
```

No award-change event occurs in this command.

## 17. Required paid-settlement interruption fixture

Create a focused valid `ACTION` state with:

### Sentinel five-road chain

```text
edge:vertex:-1,-1,2|vertex:-2,1,1
edge:vertex:-1,2,-1|vertex:-2,1,1
edge:vertex:-1,2,-1|vertex:1,1,-2
edge:vertex:1,1,-2|vertex:2,-1,-1
edge:vertex:1,-2,1|vertex:2,-1,-1
```

### Builder five-road chain

```text
edge:vertex:-1,-4,5|vertex:1,-5,4
edge:vertex:1,-5,4|vertex:2,-4,2
edge:vertex:2,-4,2|vertex:4,-5,1
edge:vertex:4,-5,1|vertex:5,-4,-1
edge:vertex:4,-2,-2|vertex:5,-4,-1
```

### Human connection

```text
edge:vertex:-1,2,-1|vertex:-2,4,-2
```

Target intersection:

```text
vertex:-1,2,-1
```

Requirements before Human's settlement:

- target is empty and every adjacent vertex is building-free;
- Human owns the connection edge;
- Sentinel and Builder each have length 5;
- current Longest Road holder is Sentinel, valid by tie retention;
- Human is current player in `ACTION` and has exactly the settlement cost through a conservation-preserving transfer.

Human executes `BUILD_SETTLEMENT` at the target. The new Human settlement interrupts Sentinel's chain into lengths 2 and 3. Builder remains the unique length-5 leader.

Expected event order:

```text
SETTLEMENT_BUILT
LONGEST_ROAD_CHANGED previous=player:sentinel new=player:builder
```

No current-player win occurs.

## 18. Hidden Victory Point turn-start fixture

Construct a valid `ACTION` state in which:

- current player is Sentinel;
- next clockwise player is Human;
- Human has five public building points;
- all five standard Victory Point cards have been moved from the development deck into Human's hand with status `IN_HAND`, preserving IDs, uniqueness, card conservation, and deterministic order;
- Human has `publicVictoryPoints = 5` and `actualVictoryPoints = 10`;
- Human is not current player, so `winnerId` remains null before the command.

The five public building points may be represented by Human owning two cities and one settlement at mutually distance-valid vertices. Use independently fixed vertex IDs in the test, not a production legality selector.

Sentinel executes the accepted `END_TURN` command.

Expected result:

```text
stateVersion increments once
currentPlayerId = player:human
phase = GAME_OVER
winnerId = player:human
all five Human Victory Point cards = REVEALED
Human publicVictoryPoints = 10
Human actualVictoryPoints = 10
RNG unchanged
```

Exact event order:

```text
TURN_ENDED player:sentinel
TURN_STARTED player:human
GAME_WON player:human victoryPoints=10
```

This proves a player who already has 10 at the start of their own turn wins without rolling.

# Required tests

## 19. Longest Road tests

Add focused tests for at least:

1. no roads -> length 0;
2. disconnected components -> maximum component/trail only;
3. exact five-edge chain -> 5;
4. central six-edge loop -> 6;
5. Y branch with six roads -> 4, not 6;
6. opponent building interruption -> split maximum 3;
7. own settlement does not interrupt -> 5;
8. edge is never counted twice;
9. independent calls are deterministic and do not mutate board/state;
10. unknown player simply has length 0 only when called as a pure board selector; authoritative state reconciliation must reject unknown holders/players through invariants.

## 20. Award tests

Cover every transition in sections 5–7, including:

- acquisition at threshold;
- no award below threshold;
- no-holder tie;
- current-holder tie retention;
- strict transfer;
- interruption transfer;
- interruption to null on a non-holder tie;
- no duplicate unchanged event;
- Largest Army uses `playedKnights`, not in-hand Knights;
- exact award event order if both change in one synthetic reconciliation.

## 21. Scoring and victory tests

Cover at least:

- settlement and city points;
- both award bonuses;
- hidden versus revealed Victory Point cards;
- non-Victory-Point cards score zero;
- `VICTORY_POINT + PLAYED` invariant rejection;
- non-current player at 10 does not win during another player's action;
- winner's hidden Victory Point cards become revealed;
- current-player score below 10 does not create an event;
- score 10 and score above 10 both win;
- no RNG/version increment inside reconciliation;
- game-over invariants;
- paid-road award acquisition golden replay;
- paid-city victory golden replay;
- paid-settlement award-transfer fixture;
- hidden-card turn-start victory fixture;
- existing Task 08 golden replay remains unchanged;
- existing Task 06 ordinary end-turn events remain unchanged.

## 22. Failure and regression rules

- Failed paid-building commands must never reconcile awards, reveal cards, create score events, consume RNG, or mutate input.
- Corrupt authoritative score/award states throw actionable invariant errors.
- Normal gameplay violations remain accepted `EngineResult` failures.
- All accepted Task 00–08 tests must remain green, with only intentional test expectation updates required by this task's scoring integration.

# Documentation

## 23. Required documentation changes

After tests pass:

1. Add an ADR documenting edge-trail Longest Road calculation, tie-retaining awards, derived score, and current-turn victory resolution.
2. Update `docs/GAME_RULES.md` with the exact award, hidden/public score, and own-turn win rules.
3. Update `docs/ARCHITECTURE.md` with the scoring reconciliation boundary and its no-version/no-RNG contract.
4. Update `README.md` current status.
5. Keep the two Task 09 files under `tasks/` unchanged.

Do not rewrite unrelated documentation.

# Forbidden work

Do not implement:

- `BUY_DEVELOPMENT_CARD`;
- `PLAY_DEVELOPMENT_CARD` or any Knight/Monopoly/Invention/Road Building execution;
- `FREE_ROAD_PLACEMENT` execution;
- domestic or maritime trade;
- generic command routing;
- legal-action projections or `PlayerView` creation;
- AI;
- Zustand stores, gateway, persistence, router, backend, networking, deployment, or UI changes;
- score or road-length fields in authoritative `GameState`/`PlayerState`;
- RNG, timestamps, UUIDs, hidden entropy, or `Math.random()`;
- new dependencies;
- a Git commit.

# Acceptance criteria

1. Longest Road is an exact edge-trail calculation over current authoritative occupancy.
2. Branch, loop, disconnected-component, own-building, and opponent-building cases pass.
3. Longest Road and Largest Army holder semantics match the frozen tie rules.
4. Score remains fully derived and distinguishes public from actual points.
5. Hidden Victory Point cards count toward actual score and are revealed only for the winner.
6. Only the current player can become winner.
7. Paid building reconciles awards and victory atomically within its existing one-version command transition.
8. `END_TURN` resolves a qualifying next player before any roll, with the exact event order.
9. No scoring helper increments version or consumes RNG.
10. Golden fixtures and all prior regression tests pass.
11. No accepted Task 01 contract or package dependency changes.
12. `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, `npm run check`, and `git diff --check` all pass.
13. No out-of-scope feature or Git commit is created.

# Completion report additions

In addition to the normal `AGENTS.md` report, include:

- exact public APIs added;
- the Longest Road traversal rule and complexity bound;
- every award tie/transfer rule implemented;
- score formula and hidden/revealed card treatment;
- paid-building and `END_TURN` integration event order;
- exact golden acquisition and victory outputs;
- paid-settlement interruption result;
- hidden-card turn-start result;
- final test counts and every command result;
- dependency, entropy, scope, and Git confirmation;
- any ambiguity or deviation instead of silently resolving it.
