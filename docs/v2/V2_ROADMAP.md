# Frontier Isles V2 — Online Multiplayer Roadmap

Target: 13 independently reviewable Codex tasks  
Rule: complete, review, test, and commit one task before starting the next

## Milestone A — Two-browser Lobby Prototype

### V2-00 — Multiplayer workspace foundation

Create npm workspaces, a Node/TypeScript Socket.IO server foundation, a minimal shared protocol package, health endpoint, configuration, tests, and documentation.

No Room logic and no frontend online UI.

Commit after acceptance:

```text
chore: establish multiplayer workspace foundation
```

Recommended Codex: GPT-5.6 Sol, High.

### V2-01 — Versioned realtime protocol contracts

Create runtime-validated network contracts and typed Socket.IO event maps:

- RoomCode
- SessionId
- ResumeToken
- SeatId
- RoomSnapshot
- create/join/leave/ready/start request and ack
- safe error union
- protocol version negotiation
- game-command wire envelope

No Room service yet.

Commit:

```text
feat: add versioned realtime protocol contracts
```

Recommended Codex: Sol, High.

### V2-02 — In-memory Room and Lobby server

Implement:

- cryptographic room code generation
- create and join
- four seats
- Host
- Ready
- leave
- AI seat assignment metadata
- room revision
- Socket.IO `join`
- per-room snapshot broadcast
- deterministic tests using injected generators
- two socket-client integration tests

No game start execution.

Commit:

```text
feat: add in-memory multiplayer lobby server
```

Recommended Codex: Sol, High.

### V2-03 — Online Lobby web UI

Implement:

- Single Player / Online Multiplayer choice
- create room
- join room
- room code display/copy
- seat list
- Host and Ready indicators
- connection state
- AI seat controls for Host
- frontend LobbyGateway
- two-browser Playwright scenario

No online game screen yet.

Commit:

```text
feat: add synchronized online lobby interface
```

Recommended Codex: Sol, High.

**Milestone A acceptance:** two browser contexts see the same Lobby and Ready changes in real time.

## Milestone B — Reliable Session and Server-Authoritative Game

### V2-04 — Session resume and Room lifecycle

Implement:

- durable server session/resume token
- never use `socket.id` as identity
- one active socket per session
- reconnect grace period
- explicit snapshot resync
- Host transfer before game start
- room cleanup/expiry
- duplicate tab policy
- connection-state recovery configuration
- injectable clock and lifecycle tests

Commit:

```text
feat: add multiplayer session recovery and room lifecycle
```

Recommended Codex: Sol, High.

### V2-05 — Extract reusable game packages

Refactor without behavior change:

- `packages/game-core`
- `packages/game-ai`
- update frontend imports
- preserve V1 LocalGameGateway
- preserve all accepted tests
- preserve deterministic simulation hash
- enforce no React/browser dependency in game-core
- workspace build/test boundaries

No server game execution yet.

Commit:

```text
refactor: extract shared game core and AI packages
```

Recommended Codex: Sol, Extra High.

### V2-06 — Server-authoritative game creation and command execution

Implement:

- Host start validation
- minimum two Humans
- AI fill to four seats
- Server GameSession
- create authoritative GameState
- derive actor from session
- accept wire command without trusted actor ID
- expected state version
- command acknowledgements
- command ID result cache
- per-player PlayerView publication
- server-run AI seats
- no full state broadcast

Commit:

```text
feat: add server-authoritative multiplayer game sessions
```

Recommended Codex: Sol, Extra High.

### V2-07 — SocketGameGateway and online game UI integration

Implement:

- SocketGameGateway compatible with current application boundary
- Lobby-to-game transition
- submit all Human commands over Socket.IO
- receive PlayerView and redacted events
- stale-version resync
- connection/reconnect UI
- retain LocalGameGateway single-player mode
- two-browser setup and normal-turn E2E

Commit:

```text
feat: connect online game gateway to the browser UI
```

Recommended Codex: Sol, High.

### V2-08 — Complete multiplayer workflows and mixed seats

Verify and complete every online pending decision:

- initial setup
- roll and production
- discards
- robber movement and theft
- paid building
- development cards
- free roads
- maritime trade
- Human-to-Human trade
- Human-to-AI trade
- AI-to-Human trade
- victory
- 2H+2AI, 3H+1AI, 4H games

Commit:

```text
feat: complete mixed human and AI online gameplay
```

Recommended Codex: Sol, Extra High.

**Milestone B acceptance:** two or more Human browser sessions legally complete one authoritative game with optional AI seats.

## Milestone C — Network Correctness, Recovery, and Release

### V2-09 — Delivery guarantees, retries, idempotency, and concurrency

Implement and test:

- ack timeout
- client retry
- duplicate command replay
- bounded idempotency cache
- command ordering
- stale version
- simultaneous submissions
- safe public rejections
- forced resync
- no double resource/build/trade effects
- disconnect during pending trade/robber workflow

Commit:

```text
fix: harden multiplayer command delivery and concurrency
```

Recommended Codex: Sol, High.

### V2-10 — Active-game disconnect policy

Implement:

- game pause when required Human is unavailable
- visible reconnect countdown/state
- resume to same seat
- grace expiry
- Host-authorized replacement by AI
- no hidden hand leakage to replacement UI
- safe game closure
- browser refresh and network-loss E2E

Commit:

```text
feat: add active-game reconnect and AI replacement policy
```

Recommended Codex: Sol, High.

### V2-11 — Room/Game repository abstraction and recovery

Implement:

- RoomRepository and GameSessionRepository
- in-memory production adapter retained
- optional durable single-process adapter chosen by ADR
- schema/version validation
- crash-safe snapshots
- restore waiting rooms and active games
- expiry cleanup
- no multi-instance claim

The storage technology is selected at this task after checking the intended host. Do not preselect Redis or a database earlier.

Commit:

```text
feat: add recoverable multiplayer room persistence
```

Recommended Codex: Sol, High.

### V2-12 — Security, multi-browser E2E, deployment, and alpha release

Implement:

- input/rate-limit hardening
- CORS production allowlist
- environment validation
- log redaction
- graceful shutdown
- 2-, 3-, and 4-Human Playwright contexts
- hidden-information DOM and wire audits
- reconnect/retry E2E
- load smoke tests
- Docker or host configuration for one long-running Node process
- static frontend configuration
- deployment documentation
- V2 alpha release checklist

Commit:

```text
chore: harden and prepare online multiplayer alpha
```

Recommended Codex: Sol, High.

**Milestone C acceptance:** V2 alpha is deploy-ready, recoverable, hidden-information-safe, and verified across multiple browser contexts.

## Estimated completion boundary

Core online prototype:

```text
V2-00 through V2-04
```

Playable server-authoritative multiplayer:

```text
V2-00 through V2-08
```

Deploy-ready V2 alpha:

```text
V2-00 through V2-12
```

## Features intentionally deferred after V2 alpha

- account login
- invitations/friends
- public matchmaking
- rankings
- spectators
- chat
- multi-instance Socket.IO
- Redis adapter
- cross-region scaling
- analytics
- moderation
