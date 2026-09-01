# Task 01 — Domain Contracts and Authoritative State Schema

## Status

Ready for Codex implementation after Task 00 is committed as a clean baseline.

## Objective

Implement the pure TypeScript contracts that every later game-engine, AI, gateway, persistence, and UI task will depend on.

This task fixes:

- branded domain identifiers;
- frozen version identifiers and literal domain values;
- resources, players, development cards, trades, board-state contracts, turn state, pending decisions, bank, awards, and seeded-random state;
- the authoritative `GameState` schema;
- player commands, committed game events, rule violations, and `EngineResult`;
- redacted `PlayerView` and legal-action projection contracts.

This task does **not** implement rules, command execution, board generation, seeded RNG behaviour, selectors, AI, stores, persistence, SVG, or additional UI.

## Mandatory reading

Read in this order before changing code:

1. `AGENTS.md`
2. `docs/PRODUCT_SCOPE.md`
3. `docs/GAME_RULES.md`
4. `docs/ARCHITECTURE.md`
5. `docs/BOARD_MODEL.md`
6. `docs/CODING_STANDARDS.md`
7. `docs/adr/ADR-0001-v1-architecture-baseline.md`
8. This task file

Inspect the existing Task 00 implementation before writing. Preserve the working landing screen and all quality scripts.

## Preflight

1. Run `git status --short` and report the result.
2. Run `npm run check` before changing files. Stop and report if the Task 00 baseline is already failing.
3. Confirm that no temporary Vite scaffold directory remains.
4. Do not alter package versions or install dependencies.

## Contract decisions frozen by this task

### Game creation is not a player command

`GameEngine.createGame(...)` / a future `GameGateway.createGame(...)` creates an initialized game already in the setup phase. Therefore, `START_GAME` is **not** part of `GameCommand`.

Make the narrow corresponding clarification in `docs/ARCHITECTURE.md`: remove `START_GAME` from the representative command list and state that game creation is an application/engine operation, not an in-game actor command.

### Maritime command does not trust a client-supplied ratio

The command carries only:

```ts
{
  readonly type: "MARITIME_TRADE";
  readonly giveResource: ResourceType;
  readonly receiveResource: ResourceType;
}
```

The future engine derives and validates the legal quantity/ratio from the player's ports and current state. Do not include a caller-supplied ratio or arbitrary give bundle in this command.

### Board contracts now; topology generation later

Implement the serializable board interfaces fixed by `docs/BOARD_MODEL.md`, but do not generate the 19/54/72 topology and do not add coordinate algorithms. That is Task 02.

### Serializable data only

All public contracts must survive JSON serialization. Do not use classes, `Map`, `Set`, `Date`, functions, symbols as data fields, or browser objects. The compile-time branding symbol used to define ID types is permitted because it has no runtime field.

## Source files

Use kebab-case filenames and named exports. Keep responsibilities separated. The following layout is required unless the existing repository has an equivalent documented convention:

```text
src/game/
├── contracts/
│   ├── commands.ts
│   ├── engine-result.ts
│   ├── errors.ts
│   ├── events.ts
│   └── views.ts
│
└── model/
    ├── awards.ts
    ├── bank.ts
    ├── board-state.ts
    ├── development-card.ts
    ├── dice.ts
    ├── game-config.ts
    ├── game-state.ts
    ├── ids.ts
    ├── pending-decision.ts
    ├── player.ts
    ├── resource.ts
    ├── ruleset.ts
    ├── trade.ts
    └── turn.ts
```

A small `src/game/model/assert-never.ts` is permitted if used by tests or exhaustive switches. Do not add barrel `index.ts` files in this task.

## 1. Frozen identifiers and versions

Define exact literal constants/types:

```text
GAME_STATE_SCHEMA_VERSION = 1
RULESET_ID = "BASE_4P_COMBINED_ACTION_V1"
BOARD_GENERATOR_VERSION = "STANDARD_RADIUS_2_V1"
RANDOM_ALGORITHM_ID = "XORSHIFT32_V1"
```

Use a `unique symbol`-based generic brand and define distinct string-backed IDs:

```text
GameId
PlayerId
TileId
VertexId
EdgeId
PortId
DevelopmentCardId
TradeId
CommandId
AiProfileId
```

Requirements:

- IDs remain strings at runtime and serialize as strings.
- Different ID types must not be assignable to each other without an explicit cast at a trusted boundary.
- Do not generate IDs and do not call `crypto.randomUUID()`.
- Do not add runtime ID libraries.

## 2. Resource model

Use these exact resource literals:

```text
LUMBER
BRICK
WOOL
GRAIN
ORE
```

Provide:

```ts
export const RESOURCE_TYPES = [
  "LUMBER",
  "BRICK",
  "WOOL",
  "GRAIN",
  "ORE",
] as const;
```

Derive `ResourceType` from the tuple and define:

```ts
export type ResourceBag = Readonly<Record<ResourceType, number>>;
```

Also provide a pure `createEmptyResourceBag(): ResourceBag` that returns a fresh object containing all five keys at zero.

Do not yet implement addition, subtraction, affordability, validation, or bank-transfer logic. Non-negative integer enforcement belongs to later engine/validation work.

## 3. Dice and number-token values

Define:

```text
DieValue = 1 | 2 | 3 | 4 | 5 | 6
DiceTotal = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12
NumberToken = 2 | 3 | 4 | 5 | 6 | 8 | 9 | 10 | 11 | 12
```

`DiceRoll` contains a readonly two-value tuple and its total. Do not implement rolling or total calculation yet.

## 4. Board contracts

Implement the conceptual contracts from `docs/BOARD_MODEL.md`:

- `HexCoordinate`
- `BoardTopology`
- `TileDefinition`
- `VertexDefinition`
- `EdgeDefinition`
- `PortDefinition`
- `BoardState`
- `TileContent`
- `Building`
- `Road`

Use exact terrain literals:

```text
FOREST
HILLS
PASTURE
FIELDS
MOUNTAINS
DESERT
```

Define `PortKind` as a discriminated union:

```ts
export type PortKind =
  | { readonly type: "GENERIC" }
  | { readonly type: "RESOURCE"; readonly resource: ResourceType };
```

Additional requirements:

- `TileDefinition.vertexIds` and `.edgeIds` are readonly six-element tuples.
- `EdgeDefinition.vertexIds` and `PortDefinition.vertexIds` are readonly two-element tuples.
- `BoardState` includes `generatorVersion: typeof BOARD_GENERATOR_VERSION`.
- Topology and occupancy remain separate.
- No SVG positions, CSS, viewport, animation, or UI data.
- Do not create topology fixtures or generation algorithms in production source.

## 5. Development cards

Use exact card types:

```text
KNIGHT
ROAD_BUILDING
MONOPOLY
INVENTION
VICTORY_POINT
```

Define:

- `DevelopmentCardDefinition`: ID and type for a card still in the deck.
- `OwnedDevelopmentCard`: ID, type, `acquiredTurnNumber`, and status.
- Status literals: `IN_HAND | PLAYED | REVEALED`.

The bank deck contains `DevelopmentCardDefinition[]`; a player's collection contains `OwnedDevelopmentCard[]`.

Do not initialize the 25-card distribution, draw cards, or implement playability.

## 6. Player model

Use four public color identifiers:

```text
RED
BLUE
ORANGE
WHITE
```

Define a controller union:

```ts
export type PlayerController =
  | { readonly type: "HUMAN" }
  | { readonly type: "AI"; readonly profileId: AiProfileId };
```

`PlayerState` contains only authoritative player-owned data:

- `id`
- `name`
- `color`
- `controller`
- `resources`
- `developmentCards`
- `playedKnights`

Do not store roads, settlements, cities, ports, piece counts, Longest Road length, score, public score, or legal actions in `PlayerState`; later selectors derive them from the board and rules.

## 7. Trade model

Define `TradeOffer` using the active/current player as the stable initiator across a negotiation chain:

```ts
export interface TradeOffer {
  readonly tradeId: TradeId;
  readonly initiatorId: PlayerId;
  readonly counterpartyId: PlayerId;
  readonly proposedById: PlayerId;
  readonly initiatorGives: ResourceBag;
  readonly counterpartyGives: ResourceBag;
  readonly parentTradeId: TradeId | null;
}
```

`proposedById` identifies whether the current terms came from the initiator or counterparty. A counter-offer creates a new `tradeId` and points `parentTradeId` to the immediately preceding offer.

Also define:

```text
MaritimeTradeRatio = 2 | 3 | 4
```

This ratio may appear in events/views, but is not supplied by the maritime-trade command.

Do not implement validation, AI evaluation, negotiation limits, or transfers.

## 8. Turn state and pending decisions

Use the exact phases already frozen in `docs/ARCHITECTURE.md`:

```text
SETUP_SETTLEMENT
SETUP_ROAD
ROLL_REQUIRED
DISCARD_REQUIRED
ROBBER_MOVE_REQUIRED
ROBBER_TARGET_REQUIRED
ACTION
FREE_ROAD_PLACEMENT
GAME_OVER
```

Define `SetupTurnState` with enough information to validate snake-order setup later:

- `round: 1 | 2`
- `placementIndex: number`
- `pendingSettlementVertexId: VertexId | null`

Define `TurnState` with:

- `turnNumber: number`
- `currentPlayerId: PlayerId`
- `phase: GamePhase`
- `setup: SetupTurnState | null`
- `lastRoll: DiceRoll | null`
- `developmentCardPlayedThisTurn: boolean`

Define a discriminated `PendingDecision` union for:

1. `DISCARD_RESOURCES`
   - triggering player
   - required count by player
   - completed player IDs
2. `MOVE_ROBBER`
   - acting player
   - cause (`DICE_SEVEN` or `KNIGHT` with card ID)
3. `CHOOSE_ROBBER_TARGET`
   - acting player
   - selected tile
   - eligible targets
   - same robber cause
4. `PLACE_FREE_ROADS`
   - acting player
   - Road Building card ID
   - remaining road count (`1 | 2`)
5. `CHOOSE_INVENTION_RESOURCES`
   - acting player
   - Invention card ID
6. `CHOOSE_MONOPOLY_RESOURCE`
   - acting player
   - Monopoly card ID
7. `RESPOND_TO_TRADE`
   - responder
   - current `TradeOffer`
   - `counterDepth: 0 | 1`

Do not implement state transitions.

## 9. Bank and awards

`BankState` contains:

- `resources: ResourceBag`
- `developmentDeck: readonly DevelopmentCardDefinition[]`

`AwardState` contains only:

- `longestRoadHolderId: PlayerId | null`
- `largestArmyHolderId: PlayerId | null`

Award lengths/counts and player scores are derived later; do not duplicate them here.

## 10. Seeded-random state

Define serializable `RandomState`:

- `algorithm: typeof RANDOM_ALGORITHM_ID`
- `seed: string`
- `state: number`
- `drawCount: number`

Do not implement seed hashing, xorshift, shuffle, dice, or any random operation. Do not call `Math.random()`.

## 11. Game configuration and authoritative state

`PlayerConfig` contains ID, name, color, and controller.

Because V1 is exactly four players, define a reusable readonly four-item tuple type and use it for:

- `GameConfig.players`
- `GameState.playerOrder`

`GameConfig` contains:

- `gameId`
- `rulesetId`
- exactly four player configs

The seed remains a separate `createGame` argument as already specified by the architecture.

Implement `GameState` with the exact authoritative fields:

```ts
export interface GameState {
  readonly schemaVersion: typeof GAME_STATE_SCHEMA_VERSION;
  readonly gameId: GameId;
  readonly stateVersion: number;
  readonly rulesetId: typeof RULESET_ID;
  readonly board: BoardState;
  readonly players: Readonly<Record<PlayerId, PlayerState>>;
  readonly playerOrder: FourPlayerTuple<PlayerId>;
  readonly bank: BankState;
  readonly turn: TurnState;
  readonly awards: AwardState;
  readonly pendingDecision: PendingDecision | null;
  readonly random: RandomState;
  readonly winnerId: PlayerId | null;
}
```

Do not add timestamps, UI fields, AI memory, save metadata, event history, mutable caches, or computed scores to `GameState`.

## 12. Commands

Define `CommandEnvelope`:

```ts
export interface CommandEnvelope {
  readonly commandId: CommandId;
  readonly actorId: PlayerId;
  readonly expectedStateVersion: number;
  readonly command: GameCommand;
}
```

`GameCommand` must be an exhaustive discriminated union containing exactly these command types:

```text
PLACE_INITIAL_SETTLEMENT
PLACE_INITIAL_ROAD
ROLL_DICE
DISCARD_RESOURCES
MOVE_ROBBER
STEAL_FROM_PLAYER
BUILD_ROAD
BUILD_SETTLEMENT
UPGRADE_CITY
BUY_DEVELOPMENT_CARD
PLAY_DEVELOPMENT_CARD
CHOOSE_INVENTION_RESOURCES
CHOOSE_MONOPOLY_RESOURCE
FINISH_FREE_ROAD_PLACEMENT
PROPOSE_TRADE
ACCEPT_TRADE
REJECT_TRADE
COUNTER_TRADE
MARITIME_TRADE
END_TURN
```

Payloads:

- settlement commands: `vertexId`
- road commands: `edgeId`
- discard: `resources`
- move robber: `tileId`
- steal: `targetPlayerId`
- upgrade city: `vertexId`
- play development card: `cardId`
- choose invention: a `ResourceBag` whose later validation requires exactly two cards
- choose monopoly: `resource`
- finish free-road placement: no additional payload
- propose trade: `offer`
- accept/reject: `tradeId`
- counter: `previousTradeId` plus new `offer`
- maritime: `giveResource` plus different `receiveResource`
- roll/buy/end turn: no additional payload

Do not add `START_GAME`, generic string payloads, callbacks, timestamps, random values, or UI metadata.

## 13. Events

Define committed internal `GameEvent` data. Internal events may contain private details; a later player-view/event projector will redact them before UI/network publication.

Include these exact discriminants:

```text
DICE_ROLLED
RESOURCE_PRODUCED
RESOURCE_PRODUCTION_BLOCKED
RESOURCES_DISCARDED
ROBBER_MOVED
RESOURCE_STOLEN
ROAD_BUILT
SETTLEMENT_BUILT
CITY_BUILT
DEVELOPMENT_CARD_BOUGHT
DEVELOPMENT_CARD_PLAYED
TRADE_PROPOSED
TRADE_REJECTED
TRADE_COUNTERED
TRADE_COMPLETED
MARITIME_TRADE_COMPLETED
LONGEST_ROAD_CHANGED
LARGEST_ARMY_CHANGED
TURN_STARTED
TURN_ENDED
GAME_WON
```

Use serializable, typed payloads. At minimum:

- dice event contains `DiceRoll`;
- production allocations identify player, tile, resource, and quantity;
- blocked production identifies resource and affected players with reason `BANK_SHORTAGE`;
- discard event contains player and exact discarded `ResourceBag` (internal/private detail);
- robber move contains player, from tile, to tile, and cause;
- stolen resource contains from/to players and exact resource (internal/private detail);
- road event includes owner, edge, and source `INITIAL_PLACEMENT | PAID_BUILD | ROAD_BUILDING_CARD`;
- settlement event includes owner, vertex, and source `INITIAL_PLACEMENT | PAID_BUILD`;
- city event includes owner and vertex;
- bought development card includes owner, card ID/type, and acquired turn (internal/private type);
- played development card includes owner, card ID/type;
- trade lifecycle events contain the relevant offer/trade IDs;
- completed domestic trade contains the accepted offer;
- completed maritime trade contains player, give/receive resources, and derived ratio;
- award changes contain previous holder and new holder;
- turn events identify the player and turn number;
- game won identifies winner and actual victory-point total.

Do not implement event redaction, localization, logging text, or replay storage.

## 14. Rule violations and engine result

Define a stable `RuleViolationCode` string-literal union that covers the planned categories without embedding English UI text. It must include at least:

```text
STALE_STATE_VERSION
UNKNOWN_ACTOR
GAME_OVER
NOT_YOUR_TURN
WRONG_PHASE
PENDING_DECISION_REQUIRED
INSUFFICIENT_RESOURCES
INSUFFICIENT_PIECES
BANK_RESOURCE_UNAVAILABLE
DEVELOPMENT_DECK_EMPTY
DEVELOPMENT_CARD_NOT_OWNED
DEVELOPMENT_CARD_NOT_PLAYABLE
DEVELOPMENT_CARD_LIMIT_REACHED
ILLEGAL_VERTEX
ILLEGAL_EDGE
DISTANCE_RULE_VIOLATION
ROAD_NOT_CONNECTED
ROAD_BLOCKED
INVALID_ROBBER_TILE
INVALID_ROBBER_TARGET
INVALID_DISCARD
TRADE_NOT_ALLOWED
INVALID_TRADE_OFFER
TRADE_PARTY_MISMATCH
TRADE_RESOURCE_UNAVAILABLE
TRADE_NOT_PENDING
SAME_RESOURCE_TRADE
MARITIME_TRADE_NOT_ALLOWED
```

`RuleViolation` contains:

- `code`
- optional readonly serializable primitive details (`string | number | boolean | null` values only)

Define `EngineResult` exactly as a success/failure discriminated union:

```ts
export type EngineResult =
  | {
      readonly ok: true;
      readonly state: GameState;
      readonly events: readonly GameEvent[];
    }
  | {
      readonly ok: false;
      readonly violation: RuleViolation;
    };
```

Do not implement an engine or throw exceptions for sample invalid commands.

## 15. Redacted player-view contracts

Implement data contracts only; do not implement `createPlayerView` yet.

Define:

### `PublicPlayerState`

- public identity/controller/color
- `resourceCardCount`
- `developmentCardCount`
- `playedKnights`
- `publicVictoryPoints`

It must not contain resource composition or hidden development-card identities.

### `PrivatePlayerState`

- the same public identity fields
- full own `resources`
- full own `developmentCards`
- `playedKnights`
- `publicVictoryPoints`
- `actualVictoryPoints`

### `PublicBankState`

- current resource supply
- development deck count only, never deck identities/order

### `LegalActionView`

Include typed projections for:

- `canRollDice`
- `canEndTurn`
- `canBuyDevelopmentCard`
- `canProposeTrade`
- legal road edge IDs
- legal settlement vertex IDs
- legal city-upgrade vertex IDs
- legal robber tile IDs
- eligible robber target player IDs
- required discard count
- playable development-card IDs
- legal maritime trade options containing give resource, receive resource, and derived ratio

### `PendingDecisionView`

A redacted discriminated union for the viewing player. It may expose only the decision the viewer must make and its legal/public choices. Include the seven pending-decision categories from section 8, but do not expose another player's private discarded resource composition or hidden cards.

### `PublicGameState`

Contains public game ID/version/ruleset, public board, public bank, turn, awards, and winner. It must not contain the authoritative random state or development deck order.

### `PlayerView`

```ts
export interface PlayerView {
  readonly stateVersion: number;
  readonly publicGame: PublicGameState;
  readonly self: PrivatePlayerState;
  readonly opponents: readonly PublicPlayerState[];
  readonly pendingDecision: PendingDecisionView | null;
  readonly legalActions: LegalActionView;
}
```

Do not add selectors or mock views to production code.

## 16. Tests

Add focused Vitest/type-contract tests. Use existing Vitest only; add no dependency.

Required coverage:

1. `RESOURCE_TYPES` has the exact five values in the frozen order.
2. `createEmptyResourceBag()` returns all five keys at zero and returns a fresh object per call.
3. Branded IDs are distinct at compile time using `expectTypeOf` or checked `@ts-expect-error` fixtures.
4. Representative instances of every `GameCommand` discriminant compile and can be exhaustively switched with `assertNever`.
5. Representative instances of every `GameEvent` discriminant compile and can be exhaustively switched.
6. A minimal synthetic `GameState` fixture can be JSON-stringified without custom serializers, functions, `Map`, `Set`, or `Date`.
7. A `PlayerView` fixture demonstrates that opponents expose only counts, while `self` exposes private composition.
8. Existing Task 00 component smoke test continues to pass.

Synthetic fixtures need not satisfy the future 19/54/72 board invariants; clearly name them contract fixtures so they are not mistaken for valid generated games.

Do not test rules that have not been implemented.

## 17. Documentation

Only these documentation changes are expected:

1. Add this task file and its prompt under `tasks/`.
2. Make the narrow `START_GAME` clarification in `docs/ARCHITECTURE.md`.
3. Update the README current-status section from “foundation only” to “foundation plus domain contracts” after all checks pass.

Do not rewrite game rules or architecture prose unrelated to this contract clarification.

## Forbidden work

Do not implement:

- command routing or execution;
- state transitions;
- resource arithmetic or validation;
- board generation, adjacency algorithms, IDs derived from geometry, or 19/54/72 invariants;
- seeded RNG implementation;
- setup order randomization;
- score, port, legal-action, hidden-information, or Longest Road selectors;
- React components, SVG, routing, Zustand stores, controllers, gateway implementations, persistence, AI, timers, animation, backend, networking, or deployment;
- new npm dependencies;
- a Git commit.

## Acceptance criteria

1. All required contracts exist under `src/game/**` and contain no React/browser/application/AI dependency.
2. Frozen literals and field names match this task exactly.
3. IDs are distinct branded string types.
4. Public data contracts are JSON-serializable plain data.
5. `GameState` has no duplicated derived score/ownership/legal-action fields.
6. `PlayerView` cannot directly expose opponent hand composition or deck order by its declared shape.
7. `GameCommand` contains no `START_GAME` and includes all required multi-step-resolution commands.
8. Maritime trade ratio is engine-derived, not client-supplied in its command.
9. Required tests pass and do not pretend to test unimplemented game rules.
10. No dependency is added and no Task 00 UI behaviour regresses.
11. `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, and `npm run check` all pass.
12. Completion report follows `AGENTS.md` and explicitly confirms no engine, board generator, RNG behaviour, AI, store, persistence, or UI feature was implemented.

## Completion report additions

In addition to the normal `AGENTS.md` report, include:

- the final list of `GameCommand` discriminants;
- the final list of `GameEvent` discriminants;
- a note confirming `START_GAME` was removed/clarified as a creation operation;
- a note confirming the maritime ratio is not supplied by the command;
- exact test counts and command results;
- any contract ambiguity found rather than silently resolved.
