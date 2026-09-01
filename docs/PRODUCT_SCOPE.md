# Product Scope — V1

## 1. Product statement

Frontier Isles is a browser-based, turn-based resource and settlement strategy game inspired by classic hex-board trading games. The first release is a complete single-player experience: one human competes against three AI players without downloading a desktop application.

## 2. Primary user outcome

A user can open the website, start a new four-player game, complete the setup phase, play a full legal match against three AI opponents, save or resume the game, and reach a deterministic win or loss under the frozen base ruleset.

## 3. V1 target platform

- Modern desktop browser
- Tablet landscape as a secondary layout
- Keyboard and mouse/touch interaction
- Static web deployment
- No account required
- No installation required

A polished phone portrait layout is not a V1 release gate.

## 4. V1 players

```text
Player 1: Human
Player 2: AI
Player 3: AI
Player 4: AI
```

Four players are fixed in V1. Player count is not configurable yet.

## 5. V1 functional scope

### Game lifecycle

- New game
- Seeded random board
- Re-enter a seed to reproduce a board
- Randomized starting player from the same seed
- Formal snake-order initial placement
- Full turn loop
- Game-over screen
- Restart with the same seed
- Start with a new seed
- Automatic local save after successful commands
- Resume the latest compatible save
- Explicit delete/reset save

### Base mechanics

- Nineteen land hexes
- Five resource types and one desert
- Number tokens
- Dice production
- Bank resource supply
- Roads
- Settlements
- Cities
- Distance rule
- Road connectivity and blocking
- Robber
- Discarding after a seven
- Random resource theft
- Domestic player trade
- Maritime bank/port trade
- Development cards
- Largest Army
- Longest Road
- Hidden and public victory points
- Ten-point victory condition

### AI

- All setup decisions
- Dice and action turns
- Building and development decisions
- Robber placement and target selection
- Required discards
- Maritime trade
- Domestic trade acceptance, rejection, counter-offers, and initiation
- Three personality profiles using one correct Normal-strength engine
- No access to hidden opponent hand composition or hidden development cards

### User interface

- Main game layout
- SVG board
- Current-player and phase indicators
- Human resource panel
- Public opponent panels
- Roll/build/trade/development/end-turn controls
- Legal placement highlights
- Trade dialog
- Robber and discard dialogs
- Game log
- Rule-violation feedback
- AI-thinking indicator
- Settings for sound/animation speed when those features exist

## 6. Explicitly out of scope for V1

- Online human multiplayer
- Spring Boot backend
- WebSocket communication
- Firebase or other authentication
- SQL or cloud database
- Matchmaking or lobby
- Chat
- Five- or six-player mode
- Expansions
- Scenario editor
- Map editor
- LLM-controlled opponents
- Machine-learning training pipeline
- Monetization
- Official CATAN assets or branding

## 7. Quality goals

### Correctness

The engine is authoritative. Every legal or illegal action is decided by the same domain rules regardless of whether the actor is human or AI.

### Determinism

Given the same ruleset, seed, and ordered command sequence, the engine must produce the same events and final state.

### Testability

Rules remain independent of React and browser APIs. Board invariants, edge cases, AI trade decisions, and deterministic replays are automated tests.

### Future multiplayer migration

React/MUI/SVG code communicates through `GameGateway`. V2 can replace the local gateway with a WebSocket gateway without redesigning the whole UI.

### Accessibility

Controls use semantic roles and keyboard-accessible MUI components. Board interaction cannot rely on color alone; legal positions and ownership require shape, icon, pattern, label, or accessible text alternatives.

## 8. Release definition

V1 is release-ready only when:

1. A human can finish multiple full matches without an unrecoverable state.
2. All four players obey the same engine rules.
3. AI players can complete every mandatory decision.
4. Save/resume preserves a deterministic valid state.
5. The required test, typecheck, lint, and production-build commands pass.
6. The public presentation uses original branding and assets.
