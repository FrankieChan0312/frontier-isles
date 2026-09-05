# ADR-V2-0003: Authoritative In-Memory Lobby

- Status: Accepted
- Date: 2026-09-05
- Scope: V2-02

## Context

Goal A needs one server-authoritative waiting Room before any online game state or command execution
exists. The Room must synchronize independent browser transports without treating Socket.IO
membership or client data as authority, and its identifiers must be unpredictable in production but
repeatable in tests.

## Decision

- Keep waiting Rooms and sessions in one process-owned `InMemoryRoomService`. Persistence,
  multi-process coordination, and online `GameState` remain out of scope.
- Start a Room at revision zero with its creator as the NORTH Human and Host. Join, Ready changes,
  AI-seat changes, and leave each increment the revision exactly once.
- Treat a Ready request that repeats the current value, removal of an already-empty AI seat, or
  reassignment of the same AI profile as a successful no-op. A no-op does not increment the Room
  revision and does not broadcast a snapshot.
- Derive every public `RoomSnapshot` from authoritative Room state in canonical seat order and
  validate it with the shared strict schema before returning or broadcasting it.
- Bind transport actions to the server-created SessionId held in `socket.data`. Never accept actor
  identity from a request and never use `socket.id` as durable identity.
- Generate RoomCode, SessionId, and ResumeToken values with Node cryptographic randomness. Inject
  generators for tests, bound collision retries, and return a safe public error on exhaustion.
- Use RoomCode-derived Socket.IO rooms only as broadcast channels. Domain Room state remains the
  authority, and tests prove broadcasts do not cross RoomCode boundaries.
- In this stage only, an unexpected disconnect performs an immediate leave and Host transfer.
  V2-04 replaces that temporary behavior with explicit recovery and grace-period policy.
- Always reject `room:start` with `GAME_START_NOT_AVAILABLE`; Goal A does not create or execute an
  online game.

## Consequences

Two real Socket.IO clients can create, join, and synchronize one isolated waiting Room with strict
revision control and public-safe failures. Process restart loses all Rooms, raw resume credentials
remain internal until V2-04 adds digest storage, and disconnected Humans do not yet have a recovery
window.
