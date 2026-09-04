# Frontier Isles V2 Goal A — Two-Browser Lobby Milestone

Status: Ready for Codex Goal execution  
Goal ID: `V2_GOAL_A_TWO_BROWSER_LOBBY_V1`  
Scope: Tasks V2-00 through V2-04  
Required branch: `feat/v2-online-multiplayer`

## 1. Goal

Extend the accepted browser-only V1 with a production-shaped Node.js + TypeScript + Socket.IO multiplayer lobby foundation.

At the end of Goal A, two independent browser contexts must be able to:

1. choose Online Multiplayer;
2. create and join the same room;
3. see the same four canonical seats;
4. see Host, Human/AI, Ready, and connection state update in real time;
5. refresh and resume the same Human seat;
6. handle a duplicate-tab session according to the frozen policy;
7. transfer Host correctly before game start;
8. leave and clean up waiting rooms safely.

Goal A does not start or execute an online game.

## 2. Accepted V1 boundary

Preserve the complete accepted V1:

- LocalGameGateway single-player mode;
- deterministic game RNG and simulation outcomes;
- AI, trading, development cards, Bank/Supply, save/load, MUI, and SVG;
- all accepted V1 tests and E2E behavior;
- no migration of V1 game code in Goal A.

Network/session entropy may use Node `crypto`. It must never be mixed into the authoritative deterministic game RNG.

## 3. Frozen architecture

Frontend:

- existing React + TypeScript + MUI + raw SVG;
- existing LocalGameGateway remains untouched for Single Player;
- add an Online Multiplayer entry and a Lobby-specific gateway/state boundary;
- `socket.io-client`.

Server:

- Node.js 24 LTS;
- TypeScript;
- Node `http`;
- Socket.IO 4.x;
- one long-running process;
- in-memory Room and Session state;
- no Express, NestJS, Fastify, database, Redis, authentication, or platform SDK.

Repository:

- npm workspaces;
- existing root V1 frontend stays in place;
- `server/`;
- `packages/realtime-contracts/`;
- no `game-core` or `game-ai` extraction until V2-05.

## 4. Canonical lobby decisions

### 4.1 Seats

Exactly four seats in this canonical order:

```text
NORTH
EAST
SOUTH
WEST
```

A newly created room assigns the creator to `NORTH`.

A joining Human receives the first empty non-AI seat in canonical order.

### 4.2 Human and AI occupancy

A seat is exactly one of:

```text
EMPTY
HUMAN
AI
```

Supported AI profiles:

```text
MERCHANT
BUILDER
SENTINEL
```

Only the Host may assign, change, or remove an AI on an empty/non-Human seat.

AI seats are always Ready and Connected for lobby display.

A Human seat may never be silently overwritten by an AI.

### 4.3 Display names

At network boundaries:

- trim surrounding whitespace;
- collapse internal whitespace runs to one space;
- reject empty names;
- limit to 24 Unicode code points;
- reject ASCII control characters;
- preserve visible case;
- reject a normalized duplicate Human display name inside the same room.

Do not expose stack traces or raw validation internals.

### 4.4 Room codes

Room codes contain exactly six characters from:

```text
ABCDEFGHJKLMNPQRSTUVWXYZ23456789
```

The server generates them using Node cryptographic randomness and bounded collision retries.

Clients may normalize typed room codes to uppercase, but the server remains authoritative and validates them.

### 4.5 Start readiness

Goal A does not start a game, but snapshots derive whether lobby composition is ready for the future start command.

A room is start-ready only when:

- all four seats are occupied;
- at least two seats are Human;
- every Human is Connected;
- every Human is Ready.

The UI may show readiness and blockers, but the Start Game action must remain clearly unavailable until Milestone B.

## 5. Versioned protocol

Freeze protocol identity:

```text
REALTIME_PROTOCOL_VERSION = "V2_REALTIME_PROTOCOL_V1"
```

Use runtime validation for every client payload and every acknowledgement/snapshot produced from untrusted or persisted data.

A small shared runtime-validation dependency is permitted only inside `@frontier-isles/realtime-contracts` and must be documented. Handwritten validators are also acceptable if exhaustive and well tested. Do not duplicate incompatible validation independently in client and server.

### 5.1 Branded/string domains

Define and validate:

```text
RoomCode
SessionId
ResumeToken
SeatId
RoomRevision
```

Do not parse domain meaning from opaque SessionId or ResumeToken values.

### 5.2 Public snapshot

`RoomSnapshot` contains only public lobby information:

- protocol version;
- room code;
- monotonically increasing non-negative integer revision;
- lifecycle status;
- Host seat ID;
- four seats in canonical order;
- normalized Human display names;
- AI profile identity;
- Human Ready state;
- public connection state;
- derived start readiness and public blocker codes.

It must not contain:

- ResumeToken;
- token digest;
- server socket ID;
- IP address;
- internal timers;
- stack traces;
- authoritative game state;
- opponent/private game data.

### 5.3 Private session result

Successful create/join/resume acknowledgement returns a private session credential containing:

- SessionId;
- ResumeToken;
- RoomCode;
- SeatId;
- protocol version.

Never broadcast it to the room and never log ResumeToken.

### 5.4 Socket event maps

Provide typed and runtime-validated equivalents for:

Client to server:

```text
room:create
room:join
room:set-ready
room:set-ai-seat
room:leave
room:request-snapshot
session:resume
room:start
```

Server to client:

```text
server:hello
room:snapshot
session:replaced
room:closed
server:error
```

`room:start` is contract-ready but must return a safe `GAME_START_NOT_AVAILABLE` response in Goal A. It must not create GameState.

Use Socket.IO acknowledgement callbacks with a discriminated result:

```text
{ ok: true, data: ... }
{ ok: false, error: { code, message } }
```

Messages must be public-safe and must not contain stack traces.

### 5.5 Safe error codes

At minimum support:

```text
PROTOCOL_VERSION_MISMATCH
INVALID_REQUEST
INVALID_DISPLAY_NAME
DISPLAY_NAME_TAKEN
INVALID_ROOM_CODE
ROOM_NOT_FOUND
ROOM_FULL
ROOM_CLOSED
NOT_ROOM_MEMBER
NOT_HOST
SEAT_UNAVAILABLE
REVISION_CONFLICT
SESSION_INVALID
SESSION_REPLACED
START_CONDITIONS_NOT_MET
GAME_START_NOT_AVAILABLE
INTERNAL_ERROR
```

## 6. Task V2-00 — Multiplayer workspace foundation

Implement the supplied:

```text
tasks/TASK_V2_00_MULTIPLAYER_WORKSPACE_FOUNDATION.md
```

Required commit:

```text
chore: establish multiplayer workspace foundation
```

Do not implement Room, Session, Lobby UI, or reconnect behavior in this stage.

## 7. Task V2-01 — Versioned realtime protocol contracts

Create the complete shared protocol boundary in `packages/realtime-contracts`.

Required behavior:

- freeze protocol version;
- define branded/string domains and canonical seat/profile/status literals;
- define request, acknowledgement, RoomSnapshot, session credential, and safe error contracts;
- define typed Socket.IO client/server event maps;
- validate all runtime payloads;
- reject extra or malformed fields where the selected validation approach supports strict objects;
- clone/freeze data at boundaries so callers cannot mutate shared constants;
- prove JSON serialization and exhaustive discriminant handling;
- keep package independent of React, MUI, Zustand, Node server implementation, and authoritative game implementation.

Required tests include:

- every accepted request/ack/snapshot;
- malformed codes, names, revisions, seat IDs, profile IDs, versions, and extra fields;
- no ResumeToken in RoomSnapshot JSON;
- canonical seat order;
- protocol mismatch;
- typed Socket.IO event map compilation;
- public-safe error serialization.

Required commit:

```text
feat: add versioned realtime protocol contracts
```

No Room service yet.

## 8. Task V2-02 — In-memory Room and Lobby server

Implement focused server modules for Room state, Room service, session creation, cryptographic generators, and Socket.IO handlers.

### 8.1 Room behavior

Create:

- a six-character cryptographic RoomCode;
- one Host Human in NORTH;
- three empty seats;
- revision starting at zero or one, documented and tested;
- one private SessionId/ResumeToken pair for the creator.

Join:

- validate protocol/name/code;
- assign first available canonical Human seat;
- reject full/closed room and duplicate normalized name;
- create a new private session credential;
- join the Socket.IO broadcast room;
- increment revision exactly once;
- broadcast the new snapshot.

Ready:

- only the owning Human session may alter its own Ready state;
- no-op requests must have a documented policy and test;
- accepted changes increment revision exactly once and broadcast.

AI seat:

- Host only;
- only an empty or existing AI seat may be changed;
- never overwrite Human;
- accepted changes increment revision exactly once and broadcast.

Leave:

- remove the leaving Human;
- invalidate their session;
- increment revision and broadcast or close the room;
- temporary V2-02 Host behavior may be replaced by V2-04, but tests must remain explicit.

Snapshot:

- always generated from authoritative Room state;
- canonical seat order;
- no private credential leakage.

### 8.2 Entropy and testability

Use Node `crypto` for production RoomCode, SessionId, and ResumeToken generation.

Inject generators into Room services for deterministic unit/integration tests.

Do not use `Math.random()`.

Bound RoomCode collision retries and fail safely.

### 8.3 Integration tests

Use ephemeral HTTP ports and real `socket.io-client` instances to prove:

- create;
- join;
- synchronized snapshot delivery;
- Ready synchronization;
- Host AI-seat synchronization;
- safe rejection;
- leave synchronization;
- Room isolation between two room codes.

Required commit:

```text
feat: add in-memory multiplayer lobby server
```

Do not create or execute an online game.

## 9. Task V2-03 — Synchronized Online Lobby interface

Add an online entry without regressing Single Player.

### 9.1 Application boundary

Create a focused Lobby gateway equivalent to:

```text
LobbyGateway
SocketLobbyGateway
```

It owns Socket.IO transport concerns and exposes typed application operations/subscriptions.

React components must not call raw socket events directly.

Do not force Lobby behavior into the existing authoritative GameGateway.

### 9.2 UI journey

Home:

- keep Single Player;
- add Online Multiplayer;
- enter display name;
- Create Room;
- Join Room with six-character code.

Lobby:

- room code with Copy action;
- four canonical seats;
- Human name;
- AI profile;
- Empty state;
- Host badge;
- Ready state;
- Connected/Reconnecting/Disconnected state;
- own Ready toggle;
- Host AI-seat controls;
- start-readiness blockers;
- Leave Room;
- clear connection status and public-safe errors.

The Start Game control must be disabled or clearly marked as coming in Milestone B. It must not call local GameState creation.

Use the existing MUI theme and responsive standards.

No official CATAN assets.

### 9.3 Configuration

Use a validated frontend environment boundary such as:

```text
VITE_REALTIME_URL=http://127.0.0.1:3001
```

Do not hard-code a production URL into components.

### 9.4 Tests

Add:

- Lobby gateway tests with a real ephemeral server where practical;
- component tests for create/join/ready/AI controls/errors;
- Playwright two-context flow proving A creates, B joins, both see identical seat/Ready/AI updates;
- Single Player regression test;
- 1440x900, 1024x768, and 480x800 layout checks;
- no console/React errors;
- no horizontal overflow.

Required commit:

```text
feat: add synchronized online lobby interface
```

No online game screen or server GameState.

## 10. Task V2-04 — Session recovery and Room lifecycle

Replace temporary disconnect identity behavior with durable session recovery.

### 10.1 Identity

Never use `socket.id` as durable identity.

Generate:

- SessionId using Node crypto;
- ResumeToken using at least 32 random bytes encoded as base64url.

Store only a one-way digest of ResumeToken on the server when practical. Never log raw tokens.

The client stores the credential in `sessionStorage`, not authoritative game/Zustand state. It must survive refresh within that tab.

### 10.2 Resume

On refresh/reconnect:

- connect;
- submit `session:resume`;
- validate protocol, SessionId, ResumeToken, room, and seat;
- restore the same seat;
- join the Socket.IO room;
- send a fresh authoritative snapshot;
- preserve display name and Ready state during a valid grace period.

Explicit snapshot resync remains available even when Socket.IO connection-state recovery reports success.

### 10.3 Frozen duplicate-tab policy

Exactly one active socket is allowed per SessionId.

The newest valid resumed connection wins.

The older socket:

- receives `session:replaced`;
- becomes non-authoritative/read-only;
- is disconnected by the server;
- clears its stored credential after receiving the replacement event;
- displays a public-safe explanation.

A replaced socket cannot mutate the room.

### 10.4 Frozen lifecycle timings

Support validated server configuration with defaults:

```text
RECONNECT_GRACE_MS=30000
ROOM_IDLE_TTL_MS=1800000
```

Use an injectable clock/timer boundary in tests.

Unexpected disconnect:

- mark Human `RECONNECTING`;
- keep seat and Ready state during grace;
- make room not start-ready while disconnected;
- broadcast snapshot;
- on valid resume, mark Connected and broadcast;
- on grace expiry, remove the Human and invalidate session.

Explicit leave:

- removes immediately and invalidates session.

### 10.5 Host transfer

Before online game start:

- if Host explicitly leaves or their grace expires, transfer Host to the first Connected Human in canonical seat order;
- do not transfer Host merely for a temporary disconnect inside grace;
- if no Human remains, close/delete the room;
- AI can never become Host.

### 10.6 Cleanup

Waiting rooms expire after `ROOM_IDLE_TTL_MS` without accepted activity.

On expiry:

- notify connected clients with `room:closed`;
- invalidate sessions;
- disconnect/leave the Socket.IO room cleanly;
- remove authoritative in-memory state.

Use injectable time; do not make tests wait real minutes.

### 10.7 Connection-state recovery

Configure Socket.IO connection-state recovery for short transport interruptions with a documented duration no greater than the explicit reconnect grace.

Explicit resume credentials and snapshot resync remain the correctness mechanism.

### 10.8 Tests

Required focused tests:

- refresh resumes same SessionId/SeatId;
- Ready state survives valid refresh;
- invalid/expired token is rejected;
- raw token is not logged or broadcast;
- newest duplicate tab replaces old;
- old socket cannot mutate;
- reconnecting state and start blocker;
- resume before deadline;
- expiry removal after deadline;
- Host transfer after leave/expiry;
- no Host transfer inside grace;
- AI never becomes Host;
- last Human removal closes room;
- idle TTL cleanup;
- explicit snapshot resync;
- room isolation;
- fake clock/timer determinism.

Required Playwright flows:

1. A creates, B joins, B refreshes, B resumes same seat.
2. Duplicate B tab takes session; original B shows replaced.
3. Host A leaves; B becomes Host.
4. Ready and AI-seat state remain synchronized through refresh/reconnect.

Required commit:

```text
feat: add multiplayer session recovery and room lifecycle
```

## 11. Stage gate

After each task:

```text
npm run typecheck
npm run lint
npm run test
npm run build
npm run check
npm run simulate
npm run check:server
npm run check:all
git diff --check
```

From V2-03 onward also run the Lobby E2E command created by the implementation.

Rules:

- fix every in-scope failure;
- preserve the V1 deterministic simulation hash;
- review hidden/private data;
- create exactly one stage commit;
- working tree clean before continuing;
- never weaken accepted tests.

## 12. Goal A hard completion conditions

Do not mark Goal A complete unless:

1. V2-00, V2-01, V2-02, V2-03, and V2-04 are complete.
2. The five required commits exist in order.
3. V1 Single Player remains operational.
4. V1 accepted tests, build, E2E, and deterministic simulations pass.
5. Root workspace clean install succeeds.
6. Web, server, and contracts checks pass.
7. Two real browser contexts synchronize one Lobby.
8. Refresh resumes the same Human seat.
9. Duplicate-tab policy works.
10. Host transfer works.
11. Idle/grace cleanup is tested with injectable time.
12. No RoomSnapshot leaks ResumeToken, token digest, socket ID, or server internals.
13. No online GameState or online game execution exists.
14. Working tree is clean.
15. Final report is marked:

```text
GOAL_A_AUTOMATED_ACCEPTANCE_PASSED
PENDING_HUMAN_TWO_BROWSER_UAT
```

## 13. Forbidden Goal A work

Do not implement:

- V2-05 or later;
- game-core/game-ai extraction;
- server-authoritative GameState;
- SocketGameGateway;
- online board/game screen;
- game commands;
- database;
- Redis;
- login/authentication;
- matchmaking;
- ranking;
- chat;
- spectators;
- deployment;
- multi-instance scaling.

Do not move or redesign accepted V1 rules.

## 14. Final report

Return:

1. five stage commits;
2. files and architecture added;
3. dependencies and reasons;
4. protocol event/contract inventory;
5. Room/session/lifecycle behavior;
6. exact check/test/E2E totals;
7. V1 simulation hash;
8. browser inspection results;
9. hidden-information/token review;
10. known limitations;
11. final HEAD and clean status;
12. explicit confirmation that V2-05+ and online game execution were not implemented;
13. the exact marker:

```text
GOAL_A_AUTOMATED_ACCEPTANCE_PASSED
PENDING_HUMAN_TWO_BROWSER_UAT
```
