# Software Architecture

## 1. Architectural objective

V1 runs locally in the browser, but its UI must be replaceable from a local engine connection to a future network connection without rewriting board rendering or interaction flows.

## 2. High-level structure

```text
React + MUI panels          Raw SVG board
          \                    /
           \                  /
              UI controllers
                    |
              Zustand stores
                    |
                GameGateway
                 /       \
     LocalGameGateway     WebSocketGameGateway (V2)
             |
     Pure TypeScript engine
             |
   Seeded RNG / AI / save repository
```

## 3. Dependency direction

Allowed direction:

```text
ui -> application -> game contracts/domain
infrastructure -> application/game contracts
ai -> game contracts/views
application -> ai/infrastructure/game
```

Forbidden direction:

```text
game -> React
 game -> MUI
 game -> Zustand
 game -> browser storage
 game -> application
 game -> infrastructure
 game -> ai
```

The domain layer must be runnable in a Node test process without a DOM.

## 4. Authoritative state

`GameState` is the authoritative state. React never owns a second writable copy of resources, ownership, score, phase, legal actions, or deck state.

```ts
export interface GameState {
  readonly schemaVersion: 1;
  readonly gameId: GameId;
  readonly stateVersion: number;
  readonly rulesetId: "BASE_4P_COMBINED_ACTION_V1";
  readonly board: BoardState;
  readonly players: Readonly<Record<PlayerId, PlayerState>>;
  readonly playerOrder: readonly PlayerId[];
  readonly bank: BankState;
  readonly turn: TurnState;
  readonly awards: AwardState;
  readonly pendingDecision: PendingDecision | null;
  readonly random: RandomState;
  readonly winnerId: PlayerId | null;
}
```

Some field details will be implemented in Task 01. This document fixes responsibilities, not final source syntax.

## 5. Commands

A command expresses an actor's intention.

```ts
export interface CommandEnvelope {
  readonly commandId: string;
  readonly actorId: PlayerId;
  readonly expectedStateVersion: number;
  readonly command: GameCommand;
}
```

Every command is validated by the engine. Human clicks and AI decisions submit the same command union.

Game creation is an application/engine operation exposed through `createGame`; it is not an in-game actor command and therefore is not represented by `START_GAME` in `GameCommand`.

Task 05 implements the pure `createGame(config, seed)` boundary. Its deterministic creation order
is standard board generation, one bounded first-player draw with clockwise rotation, then one
development-deck shuffle. The shuffled deck uses array index `0` as its top card.

Task 05 also provides a deliberately narrow setup-only command executor for
`PLACE_INITIAL_SETTLEMENT` and `PLACE_INITIAL_ROAD`. It uses the accepted command envelope,
engine result, violations, and events without introducing the future complete command router.

Task 06 adds a second narrow executor for `ROLL_DICE` and `END_TURN`. A roll threads the accepted
immutable random state through two ordered bounded draws, resolves production from authoritative
tile/building state, and commits one versioned result. Production candidates are ordered by axial
tile coordinate and then `playerOrder`; same-player yield is aggregated only within one tile.
Blocked-production events follow granted allocations in frozen resource-type order. A rolled seven
creates the accepted discard or robber-move pending decision but does not resolve it.

`turnNumber` is a global one-based player-turn sequence. Each successful `END_TURN` advances to the
next clockwise `playerOrder` entry, increments this number once, and returns to `ROLL_REQUIRED`.
The Task 05 setup executor and Task 06 lifecycle executor remain separate until later command
families can be composed without a misleading incomplete generic router.

Task 07 adds a third narrow executor for `DISCARD_RESOURCES`, `MOVE_ROBBER`, and
`STEAL_FROM_PLAYER`. Required non-current players may submit discards without changing
`turn.currentPlayerId`; successful completion IDs are stored in canonical `playerOrder` order.
The final discard creates robber movement for the original rolling player. Movement and theft are
separate commands: post-move targets derive from authoritative adjacent buildings and current hand
counts, and even one target requires an explicit steal command. Theft threads `RandomState` through
one accepted bounded draw over the target's resource-card multiset.

A resolved dice-seven workflow enters `ACTION` with the total-seven `lastRoll` retained and a null
pending decision. `ROBBER_TARGET_REQUIRED` is valid only with a coherent
`CHOOSE_ROBBER_TARGET` decision whose selected tile is the robber tile and whose ordered targets
exactly match fresh authoritative derivation.

Task 08 adds a fourth narrow executor for paid `BUILD_ROAD`, `BUILD_SETTLEMENT`, and
`UPGRADE_CITY` commands during `ACTION`. It derives piece counts and connectivity from current
board occupancy, validates placement before affordability, and atomically transfers the exact
resource cost from the actor to the bank. Successful paid builds consume no random draw and remain
in the same combined Action phase. Opponent buildings block road continuation through their
vertex, while an independently legal second endpoint still permits placement. Award, score, and
victory recalculation remain deliberately outside this executor.

Representative commands:

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
PROPOSE_TRADE
ACCEPT_TRADE
REJECT_TRADE
COUNTER_TRADE
MARITIME_TRADE
END_TURN
```

## 6. Engine result

Expected rule failures are data:

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

Exceptions are reserved for broken invariants, corrupted persisted data that cannot be migrated, and programmer errors.

## 7. Events

Events describe committed outcomes and support:

- Game log
- Snackbar messages
- Animation queue
- Sound triggers
- Replay fixtures
- AI public memory
- Future multiplayer broadcast

V1 is not full event sourcing. Save files contain authoritative state plus bounded history; they are not rebuilt solely from events.

Representative events:

```text
DICE_ROLLED
RESOURCE_PRODUCED
RESOURCES_DISCARDED
ROBBER_MOVED
RESOURCE_STOLEN
ROAD_BUILT
SETTLEMENT_BUILT
CITY_BUILT
DEVELOPMENT_CARD_BOUGHT
DEVELOPMENT_CARD_PLAYED
TRADE_COMPLETED
LONGEST_ROAD_CHANGED
LARGEST_ARMY_CHANGED
TURN_ENDED
GAME_WON
```

## 8. State machine

Game phase is explicit:

```ts
export type GamePhase =
  | "SETUP_SETTLEMENT"
  | "SETUP_ROAD"
  | "ROLL_REQUIRED"
  | "DISCARD_REQUIRED"
  | "ROBBER_MOVE_REQUIRED"
  | "ROBBER_TARGET_REQUIRED"
  | "ACTION"
  | "FREE_ROAD_PLACEMENT"
  | "GAME_OVER";
```

Multi-step actions use a discriminated `PendingDecision` union. UI dialogs render from that state rather than maintaining independent rule flags.

Likely pending decisions include:

- Resource discards
- Robber destination
- Robber target
- Free-road placements
- Invention resource choices
- Monopoly resource choice
- Human response to an AI trade

## 9. Player views and hidden information

UI and AI do not receive unrestricted `GameState`.

```ts
export interface PlayerView {
  readonly stateVersion: number;
  readonly publicGame: PublicGameState;
  readonly self: PrivatePlayerState;
  readonly opponents: readonly PublicPlayerState[];
  readonly legalActions: LegalActionView;
}
```

A player's view contains their own private cards and the public counts of opponents' cards, but not opponent hand composition or hidden development-card identity.

`createPlayerView(state, viewerId)` is a domain selector and receives automated redaction tests.

## 10. Legal action projection

The engine exposes legal action data to the UI, such as:

- Whether roll/end-turn/build/trade actions are available
- Legal road edges
- Legal settlement vertices
- Legal city-upgrade vertices
- Eligible robber tiles and targets
- Required discard count
- Legal development cards
- Legal maritime ratios/resources

The UI may disable or highlight based on this projection, but the engine validates again when a command arrives.

## 11. GameGateway

```ts
export interface GameGateway {
  createGame(config: GameConfig): Promise<PlayerView>;
  submit(command: CommandEnvelope): Promise<CommandResponse>;
  subscribe(listener: (update: GameUpdate) => void): () => void;
  saveGame(): Promise<void>;
  loadGame(gameId: GameId): Promise<PlayerView>;
}
```

### V1 LocalGameGateway

Responsibilities:

- Own authoritative in-memory `GameState`
- Call the game engine
- Reject stale `expectedStateVersion`
- Build the human `PlayerView`
- Run AI actors when required
- Pause when a human decision is required
- Publish events and views
- Auto-save successful state transitions
- Enforce an AI command safety budget

### V2 WebSocketGameGateway

Future responsibilities:

- Submit commands to Spring Boot
- Receive redacted views and events
- Reconnect and resynchronize state versions
- Never expose server-private state

React components must not branch on the concrete gateway type.

## 12. Zustand

Two stores are planned.

### Game session store

May contain:

- Current `PlayerView`
- Recent public events
- Gateway connection/status
- AI-thinking status
- Save status
- Current user-facing error

### UI interaction store

May contain:

- Hovered tile/edge/vertex
- Selected build mode
- Selected board object
- Open dialog
- Animation queue
- Board zoom/pan
- Sidebar state

The UI store must never become a second source of authoritative game facts.

## 13. Persistence

Persistence is behind `GameSaveRepository`.

V1 implementation may use browser `localStorage` because one game state is small, but UI and engine do not call `localStorage` directly.

Save envelope requires:

```text
schemaVersion
savedAt (in infrastructure metadata, not deterministic engine logic)
gameId
rulesetId
authoritative GameState
bounded event history
```

Auto-save occurs after each successful command. Failed commands do not change or save state.

Schema migration is explicit. An incompatible save produces a clear recoverable message rather than an unsafe cast.

## 14. Randomness

No direct random calls are allowed outside the seeded random module.

The planned serializable algorithm is:

```text
XORSHIFT32_V1
```

Random state includes the original seed, current unsigned 32-bit state, and draw count. Every
operation receives an immutable `RandomState` and returns its value plus a fresh successor state;
there is no hidden mutable singleton.

Task 04 hashes JavaScript UTF-16 code units with FNV-1a constants `0x811C9DC5` and `0x01000193`,
using `Math.imul` and unsigned 32-bit coercion. A zero hash is replaced with `0x6D2B79F5`.
XORSHIFT32 then applies shifts `13`, `17`, and `5` in that exact order. Bounded integers use
rejection sampling and shuffles use immutable Fisher–Yates. `Math.random()`, Web Crypto entropy,
clock entropy, seed normalization, and implicit random draws are forbidden.

Board generation threads this state explicitly through the frozen port-first draw sequence. Task 06
dice rolling consumes two ordered `nextRandomInt(random, 1, 7)` results and stores the second
successor cursor in authoritative state. Task 07 random theft consumes one bounded draw over the
target's physical resource-card count and interprets its index in `RESOURCE_TYPES` order.
Controlled AI randomness will consume the same explicit source in later tasks.

The seed encoding, unsigned transitions, rejection accounting, draw counts, and golden fixtures are
frozen so a future Java implementation can reproduce TypeScript results exactly.

## 15. Scoring reconciliation boundary

Task 09 keeps score and Longest Road length derived rather than stored. `deriveLongestRoadLength`
searches authoritative topology and edge occupancy as an edge trail, while score selectors combine
current buildings, awards, and Victory Point card visibility.

`reconcileAwardsAndCurrentPlayerVictory(state)` is a pure state-reconciliation boundary. It
recalculates Longest Road, then Largest Army, then resolves victory for only the current player.
Award events precede `GAME_WON`. The helper never increments `stateVersion` and never consumes or
replaces `RandomState`; command executors own their existing one-version transition. Successful
paid builds call the full boundary after applying payment and occupancy. `END_TURN` calls the
narrow current-player victory helper after clockwise advancement, because no award facts changed.

### Task 10 development-card lifecycle boundary

Task 10 adds the narrow `executeDevelopmentCardLifecycleCommand` boundary for development-card
purchase/play, Invention and Monopoly choices, free `BUILD_ROAD`, and dead-end free-road
completion. It is intentionally not a generic game-command router. Exact card identity is conserved
across the top-at-index-zero bank deck and owned-card collections; owned action cards remain as
`PLAYED` records, while winning Victory Point cards become `REVEALED`.

Road Building routes `BUILD_ROAD` through `FREE_ROAD_PLACEMENT`, reusing normal target,
connectivity, blocking, and piece-supply validation without payment. Invention and Monopoly retain
their origin `ROLL_REQUIRED` or `ACTION` phase while an explicit pending choice is resolved. These
choice and dead-end completion commands may validly emit no event because the public event union is
frozen.

Knight play creates the accepted Task 07 robber pending workflow with a typed Knight cause. Largest
Army changes on play, while Task 07 completes movement and any theft before Task 09 establishes a
resulting victory. Purchase and each free road reconcile scoring at their stable boundaries; a
winning first free road clears the remaining card effect before entering `GAME_OVER`.

## 16. Suggested source structure

```text
src/
  app/
  game/
    contracts/
    model/
    board/
    engine/
    rules/
    selectors/
    random/
  ai/
    agents/
    evaluation/
    goals/
    memory/
    trade/
  application/
    controllers/
    gateways/
    stores/
  infrastructure/
    persistence/
  ui/
    board/
    components/
    dialogs/
    pages/
    panels/
  theme/

tests/
  fixtures/
  integration/
  replays/
  e2e/
```

## 17. Architectural acceptance tests

Later tasks must prove:

- Game modules run without a DOM
- Game modules import no React/MUI/Zustand/browser storage
- Same seed and command sequence produce same final state hash
- Player views redact opponents' private information
- AI commands cannot bypass validation
- A stale state version is rejected by the gateway
- Save/load returns an equivalent authoritative state
