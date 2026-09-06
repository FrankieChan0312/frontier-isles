# ADR-V2-0005: Session Recovery and Room Lifecycle

- Status: Accepted
- Date: 2026-09-06
- Scope: V2-04

## Context

A transport connection is not durable player identity. Refresh, brief network loss, duplicate tabs,
and abandoned waiting Rooms need deterministic server policy without exposing private resume
credentials or relying on Socket.IO recovery as the correctness mechanism.

## Decision

- Keep SessionId as durable server identity and use an opaque ResumeToken containing 32 random
  bytes encoded as base64url. Store only its SHA-256 base64url digest and compare fixed-size digests
  with Node's timing-safe comparison. Never log the raw token.
- Store the strict private credential in browser `sessionStorage`, outside React and Zustand state.
  A valid refresh/reconnect submits `session:resume`, rejoins the broadcast channel, and receives a
  fresh authoritative snapshot for the same SessionId and SeatId.
- Allow exactly one active transport per SessionId. The newest valid resume wins; the old socket
  receives `session:replaced`, loses server authority before disconnection, clears its tab-local
  credential, and remains a disabled/read-only Lobby view with a public explanation.
- Default `RECONNECT_GRACE_MS` to 30,000 and `ROOM_IDLE_TTL_MS` to 1,800,000. Validate both as
  positive platform-safe timer delays and inject the clock/scheduler into the Room service for
  tests.
- Mark an unexpectedly disconnected Human `RECONNECTING`, preserve its seat and Ready state, keep
  the current Host during grace, and block future start readiness. A valid resume marks it
  `CONNECTED`; expiry removes and invalidates it.
- On explicit Host leave or Host grace expiry, transfer Host to the first Connected Human in
  canonical order. AI never becomes Host. If removal leaves no Connected Human eligible to own the
  public waiting Room, close it fail-safe and invalidate its remaining sessions.
- Reset waiting-Room idle expiry on successful create, join, resume, Ready/AI intent (including a
  documented successful no-op), explicit snapshot request, and surviving leave. On expiry, emit a
  public `room:closed`, invalidate every session, disconnect the broadcast channel, and delete the
  Room.
- Configure Socket.IO connection-state recovery no longer than the explicit grace. Clear recovered
  transport identity on connection and require explicit credential resume plus snapshot resync for
  authority and correctness.
- Keep `room:start` unavailable. Recovery state contains no online `GameState` or game command.

## Consequences

Refresh and short interruptions preserve the correct Human seat without trusting `socket.id`, and
duplicate tabs cannot both mutate a Room. Waiting Rooms remain process-local and intentionally
disappear on server restart; durable persistence and online game execution are later milestones.
