# ADR-V2-0007: Server-authoritative Game Sessions

- Status: Accepted
- Date: 2026-09-06
- Scope: V2-06

## Context

Goal A reserves `room:start` but does not create games. Goal B requires exactly four
server-owned seats, two to four Humans, shared deterministic rules and AI, private views,
and active-game resume through the existing session authority.

## Decision

- Keep explicit Host AI assignment. Empty seats fail the existing `SEATS_NOT_FULL`
  readiness rule. Start checks Host, waiting lifecycle, revision, full seats, two or more
  Humans, connected/Ready Humans and coherent Room/session membership synchronously.
- Add `createOnlineGame` beside the unchanged default `createGame` entry point. They share
  one creation implementation and RNG draw order; only controller eligibility differs.
  V1 creation and offline save validation retain the one-Human restriction.
- One `GameSession` belongs to each started Room. It owns immutable core state, RNG seed,
  seat/player and Human session/player maps, AI execution, lifecycle and result cache.
  Canonical seat IDs map to `player:<RoomCode>:<SeatId>`, independent of socket IDs and
  client payloads. Colors remain NORTH/RED, EAST/BLUE, SOUTH/ORANGE, WEST/WHITE. The core's
  seeded first-player rotation remains unchanged and does not change seat ownership.
- Create the game ID and seed once using Node cryptographic entropy at the server boundary.
  Inject this source in tests. The core's seeded generator owns every subsequent game draw.
- Extend the existing protocol additively with `game:command`, `game:request-snapshot` and
  `game:update`. Preserve the frozen protocol identifier and existing event names. Room
  snapshots gain ACTIVE/FINISHED lifecycle values and a game ID required only for started
  Rooms; the existing start/resume acknowledgement envelopes remain intact.
- Validate the complete command union, current PlayerView projection and redacted event
  union recursively with strict schemas. Current online views require the full legal-action
  projection, including fields that remain optional for historical V1 consumers.
- Commands contain protocol/Room/game identity, command ID, expected version and command.
  Extra actor/session/credential fields are rejected. The active socket registry and connected
  Room membership resolve the Human actor before consulting the cache or executing core rules.
  Rule rejections expose the code only, never diagnostic details or state.
- Retain at most 128 compact outcomes per Human session in FIFO order. A repeated command
  ID returns the original outcome, even with a different payload; it does not execute again.
  Authorize first. Client retries, concurrent delivery hardening and eviction stress remain V2-09.
- Acknowledge first, publish the fresh view/events to each connected Human separately, then
  advance eligible AI and publish each accepted transition. Never send a private view to a
  Room channel. Snapshot requests return fresh current projections, not an event replay.
- Use the same newest-valid-resume-wins socket registry as the Lobby. Game updates use normal
  per-socket emission with a five-second bounded receipt callback. Socket.IO excludes packets
  with acknowledgements from recovery replay; they cannot replay private game data before
  credential attachment. Unlike volatile emission, they queue behind an in-flight packet.
  Receipts do not gate execution or implement retries. Resume emits a fresh current view;
  explicit snapshot acknowledgements also provide resynchronization. V2-07 handles missed or
  superseded updates and completes the receipt immediately after validation.
- Give AI only PlayerView and that AI's own command-key history. Another actor's private
  commands never enter its context. Reserve deterministic `server-ai:<GameId>:<counter>` IDs;
  clients cannot use that namespace. Bound an advance to 256 AI commands and retain the
  shared 20,000-game / 100-turn / 12-repeat agent limits. Reject illegal/no-version-progress
  results and stop safely on agent failure; no exception contents are published.
- Stop AI at the next canonical Human discard, trade responder or acting-player boundary.
  After an awaited AI decision, verify its source version is still current. This avoids applying
  a stale choice after another eligible discard without adding a delivery/retry subsystem.
- Starting cancels waiting idle cleanup and locks join, Ready, AI-seat and leave-seat mutations.
  Active resume is supported only within the existing grace. After grace, invalidate credentials
  and mark the fixed Human seat disconnected; do not remove players, transfer game control,
  substitute AI or introduce a long-disconnect pause policy. Those policies remain V2-10.

## Consequences and verification

The server and realtime-contracts add local workspace dependencies only. There is one rules
implementation, one AI implementation, no database and no online browser authority. V2-07 is
still required to connect the browser GameGateway and enable the Lobby's Start control.

Node-only injected state factories support invariant-valid test fixtures without a wire fixture
API. Tests cover creation policy/RNG preservation, start eligibility, exact seat mappings,
waiting mutation locks, stale/duplicate/spoofed commands, redaction, active resume/replacement,
AI advancement/pauses/failure bounds, actual Socket.IO setup and normal dice synchronization.
The existing Lobby and V1 tests remain in the aggregate gates. Obsolete unavailable-start
assertions are updated to the new successful/ineligible behavior, with their other checks retained.
