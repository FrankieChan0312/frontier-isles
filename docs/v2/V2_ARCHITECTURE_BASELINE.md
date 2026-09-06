# Frontier Isles V2 — Multiplayer Architecture Baseline

Status: Proposed and ready for implementation  
Architecture ID: `V2_SOCKET_IO_SINGLE_PROCESS_V1`

## 1. Technology decisions

Frontend:

- Existing React + TypeScript + MUI + raw SVG application
- Existing LocalGameGateway remains for V1
- New SocketGameGateway for online rooms
- `socket.io-client`

The browser Lobby boundary is frozen in
[ADR-V2-0004](ADR-V2-0004-lobby-gateway-and-browser-interface.md): React uses `LobbyGateway`, while
`SocketLobbyGateway` alone owns Socket.IO events, private credentials, and wire validation. The
accepted `GameGateway` / `LocalGameGateway` path remains independent.

Server:

- Node.js 24 LTS
- TypeScript
- Node `http` server
- Socket.IO 4.x
- No Spring Boot
- No Express in the foundation task
- Runtime validation at all network boundaries
- Single-process Room and Game services initially

Repository:

- Existing Git repository
- npm workspaces
- Existing root frontend remains in place initially
- `server/`
- `packages/realtime-contracts/`
- later `packages/game-core/` and `packages/game-ai/`

## 2. Target repository shape

```text
frontier-isles/
├── src/                         # accepted V1 web client
├── tests/
├── server/
│   ├── src/
│   ├── test/
│   ├── package.json
│   └── tsconfig.json
├── packages/
│   ├── realtime-contracts/
│   ├── game-core/              # created only in extraction task
│   └── game-ai/                # created only in extraction task
├── docs/
│   └── v2/
├── package.json
└── package-lock.json
```

Do not move the accepted V1 source tree during the foundation task.

V2-05 performs the planned extraction under
[ADR-V2-0006](ADR-V2-0006-shared-game-package-extraction.md). `game-core` owns the sole accepted
domain, rules, RNG, engine and projection implementation; `game-ai` imports core and owns the
portable deterministic AI and simulations. Frontend imports use these workspaces. Independent
package source builds, Node tests, typechecks and lint checks precede consumer verification.

## 3. Authoritative boundary

V1:

```text
React → LocalGameGateway → TypeScript GameEngine in the browser
```

V2:

```text
React
  ↓ SocketGameGateway
Socket.IO
  ↓
Node Server
  ↓
Authoritative GameEngine
  ↓
Player-specific PlayerView / event projection
```

The online client never owns authoritative GameState.

The client may cache the latest PlayerView for rendering, but it may not decide legality, resolve randomness, mutate resources, or infer hidden state.

## 4. Shared contracts

`packages/realtime-contracts` is the only package imported by both web and server for network protocol data.

Goal A freezes this boundary in
[ADR-V2-0002](ADR-V2-0002-strict-versioned-lobby-protocol.md). Strict shared Zod schemas validate
both inbound requests and outbound acknowledgements/snapshots; browser and server code do not
duplicate wire validation.

It contains:

- protocol version
- runtime schemas
- typed Socket.IO event maps
- request and acknowledgement envelopes
- public RoomSnapshot
- safe error codes
- wire command request without trusted `actorId`
- reconnect/session payloads

The Server derives the actor from the resumed server session. It must not trust a client-supplied actor identity.

## 5. Room model and Socket.IO rooms

A Frontier Isles Room is a domain object. A Socket.IO room is only a server-side broadcast channel.

The Socket.IO room name is derived from the accepted RoomCode. Clients do not inspect Socket.IO room membership directly.

The first implementation is the server-authoritative, single-process service frozen in
[ADR-V2-0003](ADR-V2-0003-authoritative-in-memory-lobby.md). Rooms begin at revision zero; accepted
state changes increment once, while successful idempotent no-ops neither increment nor broadcast.

Room domain state includes:

- room code
- room revision
- lifecycle status
- Host session ID
- four seats
- Ready state
- connected/disconnected state
- AI seat profile
- optional active game ID
- reconnect deadlines

V2-04 replaces the temporary disconnect behavior with the policy frozen in
[ADR-V2-0005](ADR-V2-0005-session-recovery-and-room-lifecycle.md): 30-second reconnect grace,
30-minute waiting-Room idle expiry, SHA-256 resume-token digests, tab-scoped sessionStorage, and
newest-valid-resume-wins transport ownership.

## 6. Identity

Never use `socket.id` as durable player identity.

Use:

- `sessionId`: server-side identity
- `resumeToken`: opaque credential returned only to that client
- `roomCode`: public join code
- `seatId`: stable seat position
- `socket.id`: transport/debug identity only

Room codes and resume credentials use Node cryptographic randomness and collision checks. This network entropy is deliberately separate from the deterministic authoritative game RNG.

Do not log resume tokens.

## 7. Command delivery and idempotency

Socket.IO preserves event ordering, but default delivery is at-most-once. Therefore online game commands use:

```text
commandId
expectedStateVersion
command payload
acknowledgement
```

The Server:

1. validates the wire payload;
2. resolves the session and seat;
3. injects authoritative `actorId`;
4. checks a bounded command-result cache;
5. executes a new command once;
6. stores the result by command ID;
7. acknowledges accepted/rejected status;
8. publishes new per-player views.

A duplicate command ID from the same session returns the original acknowledgement and must not execute again.

## 8. Snapshot strategy

RoomSnapshot and PlayerView are authoritative snapshots.

Events improve UI feedback but are not the only recovery source. After reconnect or version mismatch, the client requests and receives a fresh snapshot.

Do not depend solely on missed Socket.IO packets for correctness.

## 9. Reconnection

Enable Socket.IO connection-state recovery for short transport interruptions, but also implement explicit resume credentials and snapshot resynchronization.

The configured recovery duration never exceeds `RECONNECT_GRACE_MS`. A recovered transport is not
authoritative until its explicit credential resume succeeds.

One session may have only one active socket. A newer valid connection replaces or rejects the older one according to the frozen task policy.

The frozen policy is replacement: the newer valid resume wins, while the old socket is notified,
stripped of authority, and disconnected.

## 10. Security baseline

V2-06 is implemented by [ADR-V2-0007](ADR-V2-0007-server-authoritative-game-sessions.md).
Each started Room owns a `GameSession`; the shared core remains the only rule authority.
Room broadcasts contain public Lobby data only. Game updates are individually projected and
addressed to the currently attached Human session. Start/resume keep their accepted envelopes;
the added game events carry strict commands, compact outcomes and current redacted views.
The browser GameGateway integration follows in V2-07.

- explicit CORS allowlist
- payload runtime validation
- payload size limits
- safe public error codes
- rate limits for create/join/submit
- no stack traces over the wire
- no trusted actor IDs from clients
- no full GameState broadcast
- no development-deck order or opponent hand leakage
- cryptographic room/session token generation
- server-side nickname normalization and length limits
- graceful shutdown
- secrets only through environment variables

## 11. Scaling boundary

The first supported deployment is one long-running Node process.

The default Socket.IO adapter is in-memory. Multiple server instances, Redis adapter, distributed locks, and cross-instance Room ownership are deferred.

## 12. Frozen decisions

- Same repository, new V2 branch
- npm workspaces
- Node.js 24 LTS
- Socket.IO 4.x
- fixed four game seats
- minimum two Humans to start online
- AI may fill remaining seats
- anonymous display names
- no login in V2 alpha
- no chat or spectators
- Server authoritative GameState
- client receives PlayerView only
- explicit acknowledgements and command idempotency
- durable session/resume ID, never durable `socket.id`
- single-process first deployment

## 13. Deferred decisions

- final public server host
- database vendor
- multi-instance scaling
- Redis
- accounts
- ranking
- matchmaking
- moderation
- room discovery
