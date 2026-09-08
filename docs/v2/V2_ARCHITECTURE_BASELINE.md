# Frontier Isles V2 — Multiplayer Architecture Baseline

V2-12 adds a production composition that serves the built static frontend and realtime server
from one origin, with one private SQLite volume. Network admission, rate limits, public file
confinement, safe structured diagnostics and readiness remain Node infrastructure. The pure core,
AI redaction and gateway boundaries are unchanged. See [ADR-V2-0013](ADR-V2-0013-alpha-security-and-deployment.md)
and [deployment](V2_DEPLOYMENT.md). One process is supported; multiple replicas are not.

Status: Implemented through V2-12; automated alpha acceptance passed; Human deployment UAT pending

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

## 13. Implemented browser boundary

Implemented browser boundary (V2-07, ADR-V2-0008): SocketLobbyGateway composes SocketGameGateway
on its attached session socket. The application keeps separate local and online PlayerView stores;
only LocalGameGateway uses offline saves and browser AI. Online commands omit actorId, use a
per-gateway cryptographic command namespace, and render server projections after acknowledgement,
publication or explicit snapshot resync. React has no raw Socket.IO calls or online engine access.
Publication/version ordering and viewer identity are checked before adoption; reconnect and stale
rejections refresh the current view. Online controls show and respect connection/resync/submission
state, and Host start uses authoritative readiness.

V2-08 qualifies 2H+2AI, 3H+1AI and 4H with full repeated-seed Socket.IO games and all command
families through the browser. The accepted core and server gateway behavior require no additional
multiplayer rule implementation. Test-only Node fixtures cover rare workflows without a production
state-installation interface; see ADR-V2-0009 and the Goal B acceptance matrix.

## 14. Implemented delivery boundary

V2-09 implements [ADR-V2-0010](ADR-V2-0010-command-delivery-and-serialized-execution.md).
Each GameSession has an explicit FIFO execution queue, including all server AI advancement;
unrelated Rooms have independent queues. Current socket/session authority is rechecked at dequeue.
Each Human has a bounded insertion-order result cache binding the complete canonical request.
Exact retained retries return their original compact result without mutation, RNG, AI or gameplay
publication. Conflicting reuse returns `COMMAND_ID_CONFLICT`; queue overload returns `GAME_BUSY`.

SocketGameGateway admits at most eight commands, sends one at a time, and by default uses an
eight-second acknowledgement timeout with two retries and capped exponential backoff. Configuration
is validated at gateway construction. Unresolved commands may wait at most 30 seconds per transport
reattachment attempt; permanent session changes cancel delivery. Fresh viewer-validated snapshots
repair uncertain outcomes, stale versions, reconnects, invalid/mismatched updates and version gaps.
Snapshot validation retries once, then leaves an accessible manual resync action. View and
publication versions never move backwards; a newer view alone never proves command success.

## 15. Implemented active-game presence boundary

V2-10 implements [ADR-V2-0011](ADR-V2-0011-active-game-presence-and-ai-replacement.md).
GameSession lifecycle wraps the unchanged core GamePhase. Any disconnected Human sets an
immediate presence safety latch; queued commands check it before mutation and an awaited AI
decision checks both lifecycle and presence epoch before execution. Recovering every Human
resumes the same state; no board, pending decision, private hand or RNG changes during pause.
The public presence schema carries only lifecycle, disconnected seats/deadlines, replacement
profiles and abandoned deadline. Strict Room/Game projections must agree with their seat metadata.

Expired credentials lose authority. The connected current Host may select an AI profile after
server-confirmed expiry or close the game. A GameSession controller overlay keeps the original
core PlayerId and state, removes the Human mapping/cache and supplies only that player's redacted
view to AI. Canonical connected-Human Host transfer precedes replacement authorization. Temporary
all-Human disconnection retains grace; no remaining eligible Human session closes the Room.
The 30-minute abandoned/finished retention timer cancels on resolved replacement or closure.
Disposal cancels lifecycle work and clears Room/session membership before late socket callbacks.

## 16. Implemented durable recovery boundary

V2-11 implements [ADR-V2-0012](ADR-V2-0012-transactional-multiplayer-recovery.md). The production
entry point opens a private SQLite store before accepting clients. MultiplayerRepository writes
one strict versioned Room/game/session/cache aggregate per synchronous WAL/FULL transaction.
The in-memory adapter retains focused test composition; the historical InMemoryRoomService name
now describes live in-process authority, with an injected repository for durable records.

Game commits include authoritative state, AI bookkeeping and command results before publication
or acknowledgement. Room mutation responses commit changed Room/session metadata before exposure;
read-only lookups project public state directly. Any write failure stops in-process authority and exposes only
a safe refusal. Recovery uses persisted digests, exact GameState/RNG, original seat mappings,
controller replacements and bounded cached results. Restart presence pauses active games and
retains prior disconnection deadlines, while previously connected Humans receive a 120-second
recovery window. Game publication revision advances for new recovery presence; Room revision
stays unchanged until an accepted lifecycle mutation such as resume.

Startup checks database structure/integrity and strict record/checksum/coherence. Invalid records
are quarantined, including a duplicated session across Rooms; unrelated valid Rooms recover.
Unreadable, unsupported or structurally inconsistent databases are never initialized over.
Graceful shutdown blocks admission, cancels a pending AI choice, drains the queue, flushes and
closes transports/storage. It preserves durable games; explicit/expired closure deletes them
transactionally. See the private [recovery runbook](V2_PERSISTENCE_RECOVERY.md).

## 17. Deferred decisions

- final public server host
- multi-instance scaling
- Redis
- accounts
- ranking
- matchmaking
- moderation
- room discovery
