# Task 11 — Authoritative Domestic and Maritime Trading

## Status

Ready for Codex implementation after Task 10 is accepted and committed as a clean checkpoint.

## Objective

Implement the complete authoritative Base Game trading boundary using the accepted Task 01 contracts:

- direct domestic trade between the current player and exactly one other player;
- proposal, rejection, one formal counter-offer, and acceptance;
- stable initiator/counterparty semantics across a negotiation chain;
- exact resource-bundle validation without gifts, credit, services, or same-resource overlap;
- hidden-information-safe offer validation;
- atomic player-to-player exchange on acceptance;
- authoritative port ownership derived from board buildings;
- best available maritime exchange ratio of 2:1, 3:1, or 4:1;
- atomic player-to-bank maritime exchange;
- deterministic event/version behaviour, invariants, regression tests, ADR, and documentation.

This task deliberately does **not** implement AI trade valuation, automatic AI responses, a generic command router, `PlayerView`, event redaction, Zustand, gateway/session orchestration, persistence, backend, networking, deployment, or UI changes.

# Frozen rules and protocol decisions

## 1. Base Game trade rules represented by this engine

The repository ruleset uses these semantics:

1. Trading is performed only during the current player's `ACTION` phase.
2. A domestic trade always has the current player as the stable initiator.
3. The current player may trade with any one other player, but two non-current players may not trade with each other.
4. Both sides of a domestic trade must give at least one Resource Card. Gifts, services, future promises, and credit are not legal trades.
5. A resource type may not appear with a positive quantity on both sides of the same offer. Such overlapping quantities must not be hidden inside a larger bundle.
6. The two parties may otherwise choose any positive exchange quantities and may combine different resource types.
7. A domestic trade transfers resources only after the current terms are explicitly accepted.
8. Maritime trade is always available at 4:1.
9. A controlled generic port improves maritime trade to 3:1.
10. A controlled matching resource port improves that resource's maritime trade to 2:1.
11. The engine always selects the player's best legal ratio for the supplied `giveResource`.
12. A port is controlled when the player owns a Settlement or City on either endpoint of that port's edge.
13. Another player's port provides no benefit.
14. The robber never disables a port.
15. Because this ruleset has a combined Action phase, a port built earlier in the same `ACTION` phase is available immediately to a later maritime-trade command.
16. A maritime trade must receive a different resource from the resource returned to the bank.
17. Trading may be repeated during the same `ACTION` phase while each individual command remains legal.

Do not silently substitute gifts, loans, triangular trades, escrowed promises, auctions, simultaneous multi-player offers, or a fixed-price resource market.

## 2. One-counter protocol is an application constraint, not a resource-rule change

The accepted Task 01 `RESPOND_TO_TRADE` pending contract contains:

```text
counterDepth: 0 | 1
```

Therefore one formal negotiation chain is frozen as:

```text
Initial proposal
      ↓
Accept / Reject / Counter
                    ↓
             Accept / Reject
```

A second counter inside the same chain is not supported and returns `TRADE_NOT_ALLOWED`.

After a rejection, the current player may create a new proposal with a new `TradeId`. This protocol limit prevents an unbounded pending-command loop; it does not limit how many separate trades may be attempted during the turn.

## 3. Hidden-information-safe validation

The engine is authoritative, but it must not turn offer submission into an oracle for an opponent's hidden hand.

For an initial proposal:

- validate that the initiating/current player can provide `initiatorGives`;
- do **not** reject merely because the counterparty currently lacks `counterpartyGives`.

For a counter-offer:

- validate that the player making the counter can provide the bundle attributed to that player;
- do **not** reject merely because the other party currently lacks the newly requested bundle.

For acceptance:

- revalidate both sides immediately before transfer;
- if either side cannot provide the accepted bundle, return `TRADE_RESOURCE_UNAVAILABLE` and preserve the pending trade unchanged.

Do not include exact hidden resource composition in violation details.

# Mandatory reading

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
14. `docs/adr/ADR-0009-authoritative-development-card-lifecycle.md`
15. `tasks/TASK_01_DOMAIN_CONTRACTS.md`
16. `tasks/TASK_02_STANDARD_BOARD_TOPOLOGY.md`
17. `tasks/TASK_04_SEEDED_STANDARD_BOARD_CONTENT.md`
18. `tasks/TASK_05_GAME_CREATION_AND_INITIAL_SETUP.md`
19. `tasks/TASK_06_DICE_PRODUCTION_AND_TURN_LIFECYCLE.md`
20. `tasks/TASK_07_DISCARD_ROBBER_AND_THEFT_WORKFLOW.md`
21. `tasks/TASK_08_PAID_BUILDING_ACTIONS.md`
22. `tasks/TASK_09_AWARDS_SCORING_AND_VICTORY.md`
23. `tasks/TASK_10_DEVELOPMENT_CARD_LIFECYCLE.md`
24. This task file

Inspect and reuse the accepted resource helpers, board topology, player-piece/building ownership, state validators, and test fixtures. Do not duplicate accepted responsibilities.

# Preflight

1. Run `git status --short` and report the exact result.
2. The expected starting tree is clean except for the two newly supplied Task 11 files under `tasks/`.
3. Run `npm run check` before changing production source.
4. Confirm the accepted Task 10 baseline reports 32 test files and 240 passing tests.
5. Confirm the accepted Task 01 `TradeOffer`, trade commands, trade events, `RESPOND_TO_TRADE`, `MaritimeTradeRatio`, and violation codes remain unchanged.
6. Confirm the accepted Task 05 golden setup still gives Merchant settlements at:

```text
vertex:-1,-7,8
vertex:-1,8,-7
```

7. Confirm Task 05's accepted seeded board gives Merchant control of at least one `GENERIC` port at those settlement locations.
8. Do not install dependencies or change package versions.
9. Do not create a Git commit.

# Frozen constants and public APIs

## 4. Maritime ratio constants

Provide immutable constants equivalent to:

```ts
export const DEFAULT_MARITIME_TRADE_RATIO = 4 as const;
export const GENERIC_PORT_TRADE_RATIO = 3 as const;
export const RESOURCE_PORT_TRADE_RATIO = 2 as const;
```

Do not store a player's current ratio in `PlayerState` or `GameState`. It is derived from the current board every time.

## 5. Narrow Task 11 command boundary

Provide a narrow exported type equivalent to:

```ts
export type TradingCommand = Extract<
  GameCommand,
  | { readonly type: "PROPOSE_TRADE" }
  | { readonly type: "ACCEPT_TRADE" }
  | { readonly type: "REJECT_TRADE" }
  | { readonly type: "COUNTER_TRADE" }
  | { readonly type: "MARITIME_TRADE" }
>;

export type TradingCommandEnvelope = Omit<CommandEnvelope, "command"> & {
  readonly command: TradingCommand;
};

export function executeTradingCommand(
  state: GameState,
  envelope: TradingCommandEnvelope,
): EngineResult;
```

Equivalent naming is permitted only if the exported responsibility remains one narrow Task 11 trading boundary.

Do not add the generic `executeGameCommand` router. Task 12 composes the accepted narrow executors.

## 6. Focused pure helpers

Provide focused, testable helpers for at least these responsibilities:

- validate a complete `ResourceBag` as five non-negative safe integers;
- count the total cards represented by a `ResourceBag`;
- determine whether two offer bundles contain any positive overlapping resource type;
- validate stable `TradeOffer` parties and negotiation lineage;
- test whether one player can provide their side of an offer;
- atomically exchange accepted bundles between two players;
- derive controlled port IDs from Board occupancy and topology;
- derive the best maritime ratio for one player and one `giveResource`;
- atomically execute one maritime exchange;
- validate `RESPOND_TO_TRADE` pending-decision coherence;
- assert Task 11 authoritative state invariants.

Reuse an accepted helper when it already owns one of these responsibilities. Do not create parallel resource arithmetic with inconsistent semantics.

Public helpers must return plain immutable-by-contract JSON-compatible values or domain primitives. Temporary local `Map`/`Set` values may not escape.

# Domestic offer validity

## 7. Exact bundle validity

Both `initiatorGives` and `counterpartyGives` must:

- contain exactly the accepted five resource keys;
- contain only non-negative safe integers;
- have a total quantity of at least one.

Reject a malformed/empty bundle with:

```text
INVALID_TRADE_OFFER
```

A domestic offer may contain multiple resource types and any positive total quantity. Do not impose 1:1, 2:1, or an arbitrary maximum card count.

## 8. Same-resource overlap

For every accepted `ResourceType`, this is forbidden:

```text
initiatorGives[resource] > 0
AND
counterpartyGives[resource] > 0
```

If any resource overlaps, return:

```text
SAME_RESOURCE_TRADE
```

Examples:

```text
1 LUMBER for 2 LUMBER                       invalid
1 LUMBER + 1 WOOL for 1 LUMBER + 1 ORE    invalid
1 LUMBER + 1 WOOL for 2 BRICK              valid
```

Do not silently net overlapping resources and then accept the remainder.

## 9. Stable parties and lineage

Across an entire chain:

- `initiatorId` is always the current player who created the initial proposal;
- `counterpartyId` remains the selected other player;
- `initiatorGives` always denotes resources paid by the initiator;
- `counterpartyGives` always denotes resources paid by the counterparty;
- `proposedById` identifies who authored the current terms.

Initial proposal requirements:

```text
offer.initiatorId      = envelope.actorId = state.turn.currentPlayerId
offer.counterpartyId   = a different known player
offer.proposedById     = offer.initiatorId
offer.parentTradeId    = null
```

Counter-offer requirements:

```text
newOffer.initiatorId     = pending.offer.initiatorId
newOffer.counterpartyId  = pending.offer.counterpartyId
newOffer.proposedById    = pending.responderId
newOffer.parentTradeId   = previousTradeId
newOffer.tradeId         != previousTradeId
previousTradeId          = pending.offer.tradeId
```

A `TradeId` is supplied by the command boundary. Do not generate one, parse one, use a UUID, use the clock, or add trade history to `GameState`. Task 11 validates only active-chain consistency, not global historical uniqueness.

# Shared success, failure, version, and RNG semantics

## 10. Every successful Task 11 command

Every successful Task 11 command:

- increments `stateVersion` by exactly one;
- returns a fresh immutable state graph;
- consumes no random draw;
- leaves board, development cards, awards, scoring, turn number, current player, and `lastRoll` unchanged;
- remains in `ACTION`;
- emits exactly the event required for that command;
- preserves all five resource-card conservation totals.

Trade does not trigger award or victory reconciliation because it changes no scoring source.

## 11. Every failed player command

A failed Task 11 command:

- returns the accepted `EngineResult` failure branch;
- returns no state and no events;
- consumes no random draw;
- does not increment `stateVersion`;
- leaves state and envelope deeply unchanged;
- preserves any existing valid pending trade.

Corrupt authoritative state throws an actionable `Error` before gameplay validation.

# Validation precedence

## 12. `PROPOSE_TRADE` and `MARITIME_TRADE`

Use this exact shared precedence:

1. corrupt authoritative state -> throw `Error`;
2. stale expected version -> `STALE_STATE_VERSION`;
3. unknown envelope actor -> `UNKNOWN_ACTOR`;
4. completed game -> `GAME_OVER`;
5. any non-null pending decision -> `PENDING_DECISION_REQUIRED`;
6. actor is not the current player -> `NOT_YOUR_TURN`;
7. phase is not `ACTION` -> `WRONG_PHASE`;
8. command-specific validation.

## 13. `ACCEPT_TRADE`, `REJECT_TRADE`, and `COUNTER_TRADE`

Use this exact shared precedence:

1. corrupt authoritative state -> throw `Error`;
2. stale expected version -> `STALE_STATE_VERSION`;
3. unknown envelope actor -> `UNKNOWN_ACTOR`;
4. completed game -> `GAME_OVER`;
5. `pendingDecision === null` -> `TRADE_NOT_PENDING`;
6. pending decision is not `RESPOND_TO_TRADE` -> `PENDING_DECISION_REQUIRED`;
7. command `tradeId` / `previousTradeId` does not identify the pending current offer -> `TRADE_NOT_PENDING`;
8. actor is not the pending `responderId` -> `TRADE_PARTY_MISMATCH`;
9. command-specific validation.

Do not apply `NOT_YOUR_TURN` to a valid non-current counterparty responding to the current player's offer.

# Domestic-trade command semantics

## 14. `PROPOSE_TRADE`

After shared validation, command-specific precedence is:

1. invalid stable-party fields or unknown/self counterparty -> `TRADE_PARTY_MISMATCH`;
2. malformed or empty bundle -> `INVALID_TRADE_OFFER`;
3. positive resource overlap -> `SAME_RESOURCE_TRADE`;
4. initiator cannot provide `initiatorGives` -> `TRADE_RESOURCE_UNAVAILABLE`.

Do not test counterparty affordability at proposal time.

On success:

- resources do not move;
- set `pendingDecision` to accepted `RESPOND_TO_TRADE`;
- `responderId = counterpartyId`;
- `offer = supplied initial offer`;
- `counterDepth = 0`;
- emit exactly one accepted `TRADE_PROPOSED` event using the existing Task 01 payload shape.

## 15. `REJECT_TRADE`

After shared response validation:

- clear `pendingDecision`;
- transfer no resources;
- emit exactly one accepted `TRADE_REJECTED` event;
- remain with the same current player in `ACTION`.

Rejecting is always legal for the valid pending responder. Do not revalidate either party's resource availability merely to reject.

## 16. `COUNTER_TRADE`

After shared response validation, command-specific precedence is:

1. current pending `counterDepth === 1` -> `TRADE_NOT_ALLOWED`;
2. invalid stable parties, author, parent, or reused ID -> `TRADE_PARTY_MISMATCH`;
3. malformed or empty bundle -> `INVALID_TRADE_OFFER`;
4. positive resource overlap -> `SAME_RESOURCE_TRADE`;
5. countering player cannot provide the bundle attributed to that player -> `TRADE_RESOURCE_UNAVAILABLE`.

Do not validate the other party's affordability at counter time.

On success:

- resources do not move;
- replace the pending current offer with `command.offer`;
- set `responderId` to the original initiator;
- set `counterDepth = 1`;
- emit exactly one accepted `TRADE_COUNTERED` event using the existing Task 01 payload shape.

The original initiator may now accept or reject, but may not counter again inside this chain.

## 17. `ACCEPT_TRADE`

After shared response validation:

1. validate that the initiator can provide `initiatorGives`;
2. validate that the counterparty can provide `counterpartyGives`;
3. if either side fails, return `TRADE_RESOURCE_UNAVAILABLE` without clearing the pending decision;
4. otherwise transfer both bundles atomically;
5. clear `pendingDecision`;
6. emit exactly one accepted `TRADE_COMPLETED` event containing the accepted current offer through the existing Task 01 payload shape.

Atomic means the result may not deduct one side and then fail before crediting the other.

The Bank is completely unchanged by a domestic trade.

# Maritime-trade semantics

## 18. Controlled ports

Derive port control from authoritative board data:

```text
PortDefinition.edgeId
      ↓
EdgeDefinition.vertexIds
      ↓
BoardState.vertexOccupancy
```

A player controls the port if either endpoint contains their Settlement or City.

Requirements:

- no ID parsing;
- no SVG/screen geometry;
- no reliance on array insertion order;
- return controlled IDs in deterministic code-unit order;
- do not store derived ports in `PlayerState`;
- one building controlling two ports grants both;
- duplicate kinds do not create a ratio better than the standard minimum;
- an opponent's building grants nothing to the acting player;
- robber position is irrelevant.

## 19. Best ratio derivation

For a supplied `giveResource`, derive exactly:

```text
2 if player controls a RESOURCE port matching giveResource
else 3 if player controls at least one GENERIC port
else 4
```

Examples:

```text
No port                           BRICK -> ratio 4
Generic port                      BRICK -> ratio 3
ORE port only                     ORE   -> ratio 2
ORE port only                     BRICK -> ratio 4
ORE port + Generic port           BRICK -> ratio 3
ORE port + Generic port           ORE   -> ratio 2
```

Do not permit a caller-supplied ratio. Do not use an opponent's better port. Do not combine multiple ports into a new ratio.

## 20. `MARITIME_TRADE`

After shared validation, command-specific precedence is:

1. `giveResource === receiveResource` -> `SAME_RESOURCE_TRADE`;
2. derive the best authoritative ratio;
3. player has fewer than `ratio` cards of `giveResource` -> `INSUFFICIENT_RESOURCES`;
4. bank has fewer than one card of `receiveResource` -> `BANK_RESOURCE_UNAVAILABLE`.

On success:

- move exactly `ratio` cards of `giveResource` from player to Bank;
- move exactly one `receiveResource` card from Bank to player;
- emit exactly one accepted `MARITIME_TRADE_COMPLETED` event containing the player, both resources, and derived ratio;
- remain in `ACTION` with no pending decision;
- consume no RNG.

The accepted `MARITIME_TRADE_NOT_ALLOWED` violation remains available for future rulesets. Do not force its use when a more precise frozen code above applies; 4:1 means Base Game maritime trade is always structurally available during a legal `ACTION` phase.

# Trade-state invariants

## 21. Focused authoritative assertion

Provide a focused assertion equivalent to:

```ts
export function assertTradingState(state: GameState): void;
```

It must reuse accepted validators and then reject at least:

- schema/ruleset/player-order/current-player corruption;
- invalid normal-turn phase/roll relationship;
- invalid board topology, port edge, port endpoints, or occupancy owner;
- negative/fractional Bank or player resources;
- broken per-resource conservation;
- invalid development-card conservation/status introduced by malformed fixtures;
- `RESPOND_TO_TRADE` outside `ACTION`;
- `RESPOND_TO_TRADE` with unknown parties;
- current player different from the offer initiator;
- responder not equal to the party opposite `proposedById`;
- `counterDepth = 0` with non-null parent or counterparty-authored terms;
- `counterDepth = 1` without a parent or without counterparty-authored terms;
- invalid/empty trade bundles;
- same-resource overlap;
- initial proposer unable to provide their own offered bundle;
- counter proposer unable to provide their own offered bundle;
- trade pending while `winnerId` is non-null or phase is `GAME_OVER`.

Do **not** require the non-proposing responder to own the resources requested from them. That would violate the hidden-information-safe proposal rule.

If an accepted existing invariant currently rejects a coherent `RESPOND_TO_TRADE` state, make the smallest tested extension necessary. Do not refactor unrelated engine behaviour.

# Golden domestic negotiation replay

## 22. Starting fixture

Start from the accepted Task 06 first-roll `ACTION` boundary:

```text
stateVersion      = 17
turnNumber        = 1
currentPlayerId   = player:sentinel
phase             = ACTION
lastRoll          = [3,2], total 5
random            = 1264537981 / 86
pendingDecision   = null
```

Create a test-only conservation-preserving resource rebalance:

```text
player:sentinel
  LUMBER 2, BRICK 0, WOOL 1, GRAIN 0, ORE 0

player:human
  LUMBER 0, BRICK 2, WOOL 0, GRAIN 1, ORE 0

player:merchant
  all 0

player:builder
  all 0

bank
  LUMBER 17, BRICK 17, WOOL 18, GRAIN 18, ORE 19
```

Board, deck, awards, turn data, player identities/controllers, and RNG remain unchanged.

## 23. Exact three-command chain

### Command 1 — initial proposal at expected version 17

Actor:

```text
player:sentinel
```

Offer:

```text
tradeId             trade:task-11:initial
initiatorId         player:sentinel
counterpartyId      player:human
proposedById        player:sentinel
parentTradeId       null

initiatorGives
  LUMBER 1

counterpartyGives
  BRICK 1
```

All unspecified resource quantities are zero.

Result:

```text
stateVersion = 18
pending kind = RESPOND_TO_TRADE
responder    = player:human
counterDepth = 0
resources    unchanged
random       unchanged
one TRADE_PROPOSED event
```

### Command 2 — counter at expected version 18

Actor:

```text
player:human
```

```text
previousTradeId     trade:task-11:initial
new tradeId         trade:task-11:counter
initiatorId         player:sentinel
counterpartyId      player:human
proposedById        player:human
parentTradeId       trade:task-11:initial

initiatorGives
  LUMBER 1
  WOOL   1

counterpartyGives
  BRICK 2
```

Result:

```text
stateVersion = 19
pending kind = RESPOND_TO_TRADE
responder    = player:sentinel
counterDepth = 1
resources    unchanged
random       unchanged
one TRADE_COUNTERED event
```

### Command 3 — accept at expected version 19

Actor:

```text
player:sentinel
```

Trade ID:

```text
trade:task-11:counter
```

Final result:

```text
stateVersion     = 20
phase            = ACTION
currentPlayerId  = player:sentinel
pendingDecision  = null
random           = 1264537981 / 86
```

Final resources:

```text
player:sentinel
  LUMBER 1, BRICK 2, WOOL 0, GRAIN 0, ORE 0

player:human
  LUMBER 1, BRICK 0, WOOL 1, GRAIN 1, ORE 0

player:merchant
  all 0

player:builder
  all 0
```

Bank remains exactly:

```text
LUMBER 17, BRICK 17, WOOL 18, GRAIN 18, ORE 19
```

Event sequence over the chain:

```text
TRADE_PROPOSED
TRADE_COUNTERED
TRADE_COMPLETED
```

No RNG draw, turn transition, score event, award event, or victory event occurs.

# Golden maritime replay

## 24. Starting fixture

Use the accepted Task 06 golden boundary after Merchant's normal roll and before Merchant ends the turn:

```text
stateVersion      = 21
turnNumber        = 3
currentPlayerId   = player:merchant
phase             = ACTION
lastRoll          = [5,4], total 9
random            = 2261670735 / 90
pendingDecision   = null
```

The accepted Task 05 setup gives Merchant buildings at both:

```text
vertex:-1,-7,8
vertex:-1,8,-7
```

At least the first location controls the frozen Task 05 generic port:

```text
edge:vertex:-1,-7,8|vertex:-2,-5,7
```

Create a test-only conservation-preserving resource rebalance:

```text
player:merchant
  LUMBER 0, BRICK 3, WOOL 0, GRAIN 0, ORE 0

all other players
  all 0

bank
  LUMBER 19, BRICK 16, WOOL 19, GRAIN 19, ORE 19
```

Execute at expected version 21:

```text
actor           player:merchant
command         MARITIME_TRADE
giveResource    BRICK
receiveResource ORE
```

The engine must derive ratio `3` from Merchant's controlled generic port.

Final result:

```text
stateVersion     = 22
phase            = ACTION
currentPlayerId  = player:merchant
pendingDecision  = null
random           = 2261670735 / 90
```

Final resources:

```text
player:merchant
  LUMBER 0, BRICK 0, WOOL 0, GRAIN 0, ORE 1

bank
  LUMBER 19, BRICK 19, WOOL 19, GRAIN 19, ORE 18
```

Exactly one event is emitted:

```text
MARITIME_TRADE_COMPLETED
player: player:merchant
give: BRICK
receive: ORE
ratio: 3
```

# Required focused source layout

Use focused files under existing domain directories. This layout is recommended and may be adjusted only for equivalent documented separation already present:

```text
src/game/
├── model/
│   └── standard-maritime-trade.ts
│
├── rules/
│   ├── resource-bag-validation.ts
│   ├── domestic-trade-rules.ts
│   ├── player-ports.ts
│   ├── maritime-trade-rules.ts
│   └── *.test.ts
│
└── engine/
    ├── trading-engine.ts
    ├── trading-invariants.ts
    ├── trading-engine.test.ts
    ├── trading-invariants.test.ts
    └── task-11-trading.test-helper.ts
```

Reuse existing files/helpers instead of creating duplicates when responsibilities already exist. Do not add barrel `index.ts` files, classes, a generic reducer framework, or speculative empty modules.

`src/game/**` must remain independent of React, MUI, Zustand, browser storage, application services, AI, and networking.

# Required tests

Use existing Vitest only. Add no dependency.

## Domestic trade structure and hidden information

1. A valid initial proposal creates the exact pending state and one `TRADE_PROPOSED` event.
2. Only the current player in `ACTION` may initiate a trade.
3. Self-trade, unknown counterparty, wrong initiator, wrong author, or non-null initial parent returns `TRADE_PARTY_MISMATCH`.
4. Empty, negative, fractional, incomplete, or otherwise malformed bundles return `INVALID_TRADE_OFFER`.
5. Any positive resource overlap returns `SAME_RESOURCE_TRADE`.
6. Initial proposer resource shortage returns `TRADE_RESOURCE_UNAVAILABLE`.
7. An initial proposal still succeeds when the counterparty lacks the requested bundle, proving no hidden-hand oracle.
8. A valid pending initial offer satisfies the focused invariant without mutation.

## Responses and one-counter chain

9. Only the exact pending responder may accept, reject, or counter; other actors return `TRADE_PARTY_MISMATCH`.
10. No pending trade or wrong current trade ID returns `TRADE_NOT_PENDING`.
11. A different pending-decision kind returns `PENDING_DECISION_REQUIRED`.
12. Reject clears pending, changes no resources, and emits exactly `TRADE_REJECTED`.
13. A valid counter preserves stable parties, uses a fresh ID/parent, swaps responder to the initiator, and emits exactly `TRADE_COUNTERED`.
14. A counter validates the countering player's offered bundle but not the other party's requested bundle.
15. Wrong counter lineage/author/parties/reused ID returns `TRADE_PARTY_MISMATCH`.
16. A second counter at `counterDepth = 1` returns `TRADE_NOT_ALLOWED` and preserves pending.
17. Accept atomically exchanges both bundles, clears pending, leaves Bank unchanged, and emits exactly `TRADE_COMPLETED`.
18. Accept with either party unable to pay returns `TRADE_RESOURCE_UNAVAILABLE`, transfers nothing, and preserves pending.
19. Domestic exchanges preserve all five global resource totals and consume no RNG.
20. The exact three-command golden domestic replay matches every version, pending field, resource total, event, and RNG anchor.

## Port ownership and maritime ratio

21. A Settlement on either port endpoint grants control.
22. A City on either port endpoint grants control.
23. An opponent's building does not grant control to the acting player.
24. Robber placement on an adjacent land tile does not disable a port.
25. Controlled port IDs are deterministic and derived without parsing IDs or using UI geometry.
26. No port gives 4:1; generic gives 3:1; matching resource port gives 2:1.
27. A non-matching resource port does not improve that resource.
28. Matching resource port beats generic port for that resource.
29. Generic port applies to every give resource when no matching 2:1 port exists.
30. Task 04's frozen ORE port can be used in a focused pure-helper fixture to prove exact 2:1 derivation.

## Maritime command execution

31. Same give/receive resource returns `SAME_RESOURCE_TRADE`.
32. Insufficient give cards returns `INSUFFICIENT_RESOURCES`.
33. Empty receive stack returns `BANK_RESOURCE_UNAVAILABLE`.
34. A successful maritime trade transfers the exact ratio to Bank, one card to player, increments version once, emits one exact event, and consumes no RNG.
35. Repeated maritime trades in the same `ACTION` phase work while affordable.
36. A port acquired earlier in the same combined `ACTION` phase is recognized by a later trade command through current Board occupancy.
37. The exact Merchant 3:1 golden replay matches version, resources, Bank, ratio event, phase, and RNG.

## Validation, corruption, and regressions

38. Shared validation precedence is exact for proposal/maritime commands.
39. Response validation precedence is exact and does not wrongly require the responder to be current player.
40. Failed commands leave state/envelope/pending/RNG deeply unchanged.
41. Corrupt trade pending fields, port topology, occupancy owner, or resource conservation throw actionable invariant errors.
42. Returned success states/events remain plain JSON-compatible data.
43. No production source introduces `Math.random`, Web Crypto randomness, UUIDs, timestamps, or hidden entropy.
44. All accepted Task 00-10 tests continue to pass.

Do not construct golden expected values by calling the production implementation being tested.

# Documentation

Expected documentation changes:

1. Add this task file and its prompt under `tasks/`.
2. Narrowly update `docs/GAME_RULES.md` with:
   - current-player-only domestic trades;
   - no gifts, credit, services, triangular trade, or same-resource overlap;
   - proposal/counter/accept semantics;
   - 4:1, generic 3:1, matching resource 2:1;
   - own-building port control and robber non-interference;
   - immediate same-Action port use.
3. Narrowly update `docs/ARCHITECTURE.md` with:
   - authoritative pending trade workflow;
   - stable initiator/counterparty fields;
   - hidden-information-safe proposal validation;
   - derived port ownership and ratio;
   - Task 12 boundary for routing and redacted views.
4. Add `docs/adr/ADR-0010-authoritative-domestic-and-maritime-trading.md` recording:
   - direct one-counter protocol;
   - no resource reservation/escrow and acceptance-time revalidation;
   - proposer-only availability checks before acceptance;
   - best-ratio port derivation from Board occupancy;
   - no RNG and no authoritative cached port/ratio fields.
5. Update the README current-status section only after all checks pass.

# Explicitly out of scope

Do not implement:

- AI trade values, personalities, goals, acceptance thresholds, or automatic responses;
- natural-language negotiation;
- broadcast offers or auctions;
- more than one formal counter inside one pending chain;
- trade cancellation/withdrawal command;
- trade timeouts;
- trade history, analytics, or persistence;
- command/trade ID generation;
- generic command router;
- `PlayerView` creation or event redaction;
- legal-action projection;
- MUI trade dialogs or any UI change;
- Zustand stores or gateway/session control;
- save/load;
- backend, WebSocket, authentication, or networking;
- any Task 01 public-contract modification;
- a Git commit.

# Acceptance criteria

1. Domestic and maritime commands execute through one narrow authoritative Task 11 boundary.
2. Only the current player initiates direct trades; the designated non-current responder can respond without `NOT_YOUR_TURN`.
3. Offer bundles are complete, positive on both sides, non-overlapping, and stable across counter lineage.
4. Proposal/counter validation does not leak the non-proposing party's hidden resource composition.
5. Acceptance revalidates and atomically exchanges both sides.
6. One formal counter is supported exactly; a second is rejected without state change.
7. Port ownership is derived from buildings on authoritative topology endpoints.
8. Best maritime ratios are exactly 2, 3, or 4 and never client supplied.
9. Domestic and maritime trades exactly conserve all resource cards.
10. Every success increments version once, emits the one accepted event, and consumes no RNG.
11. Both frozen golden replays match exactly.
12. Representative corrupted states are rejected and failures are immutable.
13. No accepted public contract is changed and no out-of-scope feature is implemented.
14. No dependency is added.
15. `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, `npm run check`, and `git diff --check` all pass.
16. No Git commit is created.

# Completion report additions

In addition to the normal `AGENTS.md` report, include:

- files created/changed;
- exported Task 11 APIs and helpers;
- exact validation precedence for initiation, maritime, and responses;
- exact hidden-information-safe availability policy;
- exact counter-depth/lineage behaviour;
- port-control and best-ratio derivation rules;
- golden domestic replay versions, pending transitions, resources, events, and RNG;
- golden maritime replay port anchor, ratio, resources, Bank, event, and RNG;
- exact test-file/test totals and every command result;
- confirmation that Task 01 contracts and Task 00-10 behaviours remain accepted;
- dependencies/deviations/blockers;
- explicit scope confirmation;
- confirmation that no Git commit was created.
