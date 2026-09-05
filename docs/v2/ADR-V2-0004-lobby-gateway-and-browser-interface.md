# ADR-V2-0004: Lobby Gateway and Browser Interface

- Status: Accepted
- Date: 2026-09-05
- Scope: V2-03

## Context

The accepted V1 browser routes authoritative local play through `GameGateway`. Online waiting-Room
transport is a different application concern: it has public Room snapshots and private session
credentials, but no online `GameState` or game commands. React must not own Socket.IO event details
or infer Room authority.

## Decision

- Add a dedicated `LobbyGateway` application contract and `SocketLobbyGateway` implementation.
  Do not add Lobby operations to `GameGateway` and do not modify `LocalGameGateway`.
- Let the gateway own Socket.IO connection state, private credentials, raw event names, shared
  request/acknowledgement validation, latest public snapshot, and the caller's public SeatId.
- Expose immutable application updates and intent-shaped operations to React. Components submit
  Ready and Host AI-seat intent; the gateway supplies the latest authoritative Room revision.
- Configure the transport through validated `VITE_REALTIME_URL`. The default loopback origin is for
  local development only; components contain no deployment URL.
- Add Online Multiplayer beside the existing Single Player journey. Render canonical public seat
  state, Host/Ready/connection status, start blockers, Room-code copy, leave, and Host AI controls
  using the existing MUI theme and responsive layout.
- Keep Start Game visibly disabled and labelled for Milestone B. No online game screen, local
  `GameState` creation, or game command is reachable from the Lobby.
- Defer credential persistence and automatic resume to V2-04. In V2-03 the credential remains
  private in gateway memory only.

## Consequences

The web application now demonstrates true two-browser Room synchronization without coupling UI to
Socket.IO or disturbing Single Player. Refresh still loses the in-memory credential in this stage;
V2-04 adds sessionStorage, resume, duplicate-tab handling, and lifecycle recovery at the same
gateway boundary.
