# V2 Alpha Protocol Notes

The frozen `V2_REALTIME_PROTOCOL_V1` identifier and accepted twenty `GameCommand` families remain
unchanged. `packages/realtime-contracts` owns strict runtime validation and serializable public
contracts; no private persistence schema is exported there.

- Lobby: create/join/Ready/AI-seat/start/leave/snapshot, session resume and newest-tab replacement.
- Game: command intent, viewer-specific update and explicit snapshot/resynchronization.
- Presence: public disconnected seats/deadlines, replacement-required state, Host-selected AI
  replacement and Host closure. Presence lifecycle wraps the core GamePhase.
- Errors: safe acknowledgements now include `RATE_LIMITED` and `SERVER_BUSY` for network and Room
  admission. No stack, schema internals, request fingerprint, cache, state, RNG, digest or path is returned.

Human actor identity comes from the current attached server session. A command binds game/Room,
command ID, expected state version and a strict intent. V2-09 canonical SHA256 fingerprints and
bounded per-Human FIFO results make identical replay return the original result. Conflicting reuse
is rejected; replay does not run AI, consume RNG or publish another mutation. A per-game FIFO queue
serializes Human and AI work; unrelated Rooms have separate queues. Socket authority is checked
again when queued work executes.

Browser delivery has one bounded ordered queue, stable command IDs through timeout/retry,
bounded backoff, cancellation and fresh snapshot recovery. Incoming views are validated and
monotonic; stale/out-of-order/identity-mismatched/invalid views cannot replace authoritative state.
No browser executes an online authoritative command optimistically. A five-second private-update
receipt releases transport callbacks only; it does not authorize a game mutation or certify durable
acceptance. Receipt-bearing updates are excluded from Socket.IO's recovery backlog. Slow consumers
are disconnected after 64 outstanding receipts or receipt timeout and resume from a fresh view.

Persistence atomically commits the Room/game aggregate including the result cache before success
acknowledgement or publication. Server restart preserves exact game/RNG/private state and recent
command results; recovery changes public presence metadata and pauses until required Humans resume.
No stored aggregate is a public protocol response. See ADRs 0010–0013 for precise contracts and bounds.
