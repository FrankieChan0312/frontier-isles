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

Representative commands:

```text
START_GAME
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

Random state includes the original seed, current unsigned 32-bit state, and draw count. String seeds are deterministically hashed to a non-zero initial state. Fisher-Yates shuffling, dice, random theft, board generation, deck generation, and controlled AI randomness all consume this source.

This simple algorithm is chosen so a future Java implementation can reproduce the same unsigned 32-bit operations.

## 15. Suggested source structure

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

## 16. Architectural acceptance tests

Later tasks must prove:

- Game modules run without a DOM
- Game modules import no React/MUI/Zustand/browser storage
- Same seed and command sequence produce same final state hash
- Player views redact opponents' private information
- AI commands cannot bypass validation
- A stale state version is rejected by the gateway
- Save/load returns an equivalent authoritative state
