# ADR-V2-0010: Command Delivery and Serialized Execution

- Status: Accepted
- Date: 2026-09-07
- Scope: V2-09

## Decision

Each GameSession owns a bounded FIFO execution queue. Admission order is the explicit
order of calls to that queue. The production Human pipeline checks current socket and
session authority after dequeue, executes through the existing engine, records the
outcome, publishes an accepted transition and advances AI within that same queue item.
AI-only advancement uses the same queue. No Room shares a mutation lock with another
Room. The queue releases after failures and has an explicit capacity; overload returns
a safe retryable refusal without running the engine.

The existing session-scoped result cache now stores the canonical SHA-256 request
fingerprint with the original compact acknowledgement. Canonical serialization sorts
object keys by code-unit order and preserves array order. Room/game identity, expected
version and complete command payload participate. Session identity is the enclosing
cache key and is authorized before lookup. This supersedes ADR-V2-0007's temporary
different-payload replay policy: a reused ID with a different fingerprint returns
`COMMAND_ID_CONFLICT`, with no original data, fingerprint or cache information.

Retain 128 results per Human by default. Evict strictly by first-insertion order; reads
and replays do not refresh retention. The cache lasts no longer than its GameSession.
Both successes and ordinary rule failures are cached. An exact successful replay after
eviction still has an old expected version, so it cannot execute the earlier mutation
again. No promise of replaying the original acknowledgement exists beyond retention.
Exact retained replays neither publish a new effect nor invoke AI, including after AI
has advanced. The cached version describes the original Human result; a fresh snapshot
may legitimately be newer.

The browser owns one bounded ordered command queue. Requests are validated and detached
on admission. Each retry sends precisely that request, including its original command
ID and expected version. Defaults: eight admitted commands, eight-second acknowledgement
timeout, two retries, deterministic exponential backoff from 250 ms capped at one second.
Each reconnect wait is bounded to 30 seconds. Snapshot validation permits one additional request,
then exposes a resync-required state with the manual resync control still available. Queue capacity
defaults to 64 operations per GameSession; constructor limits prevent unbounded configuration.
There is no retry entropy and no authoritative browser execution. The browser stores
no durable command outbox; reload resumes by credential and authoritative snapshot.

Transport interruption leaves an unresolved request eligible for bounded retry after
explicit credential resume. Session replacement, Room/game identity change, leave,
closure and disposal cancel queued work. Game completion cancels further mutations;
the command establishing victory may still receive its authoritative outcome. Delivery
and resynchronization status is publicly safe application data, validated by shared
strict schemas and displayed accessibly. Neither request bodies nor credentials enter
delivery notifications.

Fresh authoritative snapshots resolve stale versions, uncertain acknowledgements,
reconnect, invalid snapshots, identity mismatch and gaps. Snapshot acceptance checks
Room/game/viewer identity and monotonic state/publication versions; older responses
never replace newer views. Event histories are presentation only. An uncertain result
is never labelled successful by observing a version increase.

## Verification and boundaries

Tests exercise queue order and capacity, held AI decisions, independent Rooms, rechecked
authority, competing stale commands, canonical conflicts, FIFO eviction, all mutation
families, dropped acknowledgements, late requests, reconnect and strict resync. Browser
tests use test-owned WebSocket interception; production has no fault injection endpoint.
No game-core rule, RNG algorithm, V1 save or local gateway changes. Active pause and
replacement, durable restart recovery and production security remain V2-10 through V2-12.

Transport references: Socket.IO's [delivery guarantees](https://socket.io/docs/v4/delivery-guarantees/)
and [connection recovery](https://socket.io/docs/v4/connection-state-recovery/) document
why application-level retries and explicit snapshot recovery are needed. The pinned
4.8.3 client implementation was also inspected for timeout/disconnect callback cleanup.
