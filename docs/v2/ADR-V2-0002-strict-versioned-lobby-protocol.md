# ADR-V2-0002: Strict Versioned Lobby Protocol

- Status: Accepted
- Date: 2026-09-05
- Scope: V2-01

## Context

The browser and realtime server need one shared definition for untrusted lobby messages. TypeScript
types alone disappear at runtime and cannot reject malformed browser payloads, protocol drift,
extra fields, forged readiness, or accidental private fields in public snapshots.

## Decision

- Keep `V2_REALTIME_PROTOCOL_V1` as the explicit protocol identity on every request, snapshot,
  private session credential, and server hello.
- Use `zod@4.5.4` only in `@frontier-isles/realtime-contracts` for strict runtime schemas. Both the
  browser and server import these schemas rather than maintaining separate validators.
- Define branded RoomCode, SessionId, ResumeToken, and RoomRevision domains plus canonical Seat,
  AI profile, lifecycle, connection, readiness-blocker, and safe-error literals.
- Normalize incoming display names by trimming and collapsing whitespace, then enforce 1–24 Unicode
  code points and reject ASCII controls. Snapshot names must already be normalized.
- Define all Goal A lobby request, acknowledgement, and server-event maps. Actor identity is absent
  from client payloads and will be derived from the server session.
- Keep ResumeToken only in private create/join/resume results. `RoomSnapshot` is strict, canonical,
  semantically validates derived readiness and Human Host ownership, and contains no transport,
  timer, token, digest, or game fields.
- Freeze shared literal/event-name collections and return detached parsed data from schemas. No Room
  service, online GameState, or game-command protocol is introduced in this stage.

## Consequences

Malformed and version-mismatched messages fail before reaching Room behavior, acknowledgement
errors have one public-safe shape, and Socket.IO client/server maps compile from the same source.
The contracts workspace gains one small runtime dependency; frontend/server packages do not need
their own validation dependency or copy of the lobby rules.
