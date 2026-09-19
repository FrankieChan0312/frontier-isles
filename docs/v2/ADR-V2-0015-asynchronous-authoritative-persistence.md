# ADR-V2-0015: Asynchronous authoritative persistence

- Status: Implemented under the authorized async persistence goal; pending Human architecture review
- Date: 2026-09-17
- Supersedes: synchronous repository/worker portions of ADR-V2-0012 and ADR-V2-0014;
  extends ADR-V2-0010 queue ownership and ADR-V2-0011 transport safety

## Before and after

At `ee6546c`, `MultiplayerRepository.load/save/remove/flush/close` returned values/void.
The MySQL facade posted to a worker and used `Atomics.wait` while the worker awaited
mysql2. This blocked HTTP, Socket.IO and every Room during database network I/O.
That implementation and its local acceptance remain documented as historical evidence.

The shared interface now returns `Promise<readonly MultiplayerRecord[]>` for load and
`Promise<void>` for save/remove/flush/close. `MysqlMultiplayerRepository.open()` directly
opens the mysql2/promise implementation and its bounded pool in the authority process.
The worker, message protocol, shared memory and synchronous wait are removed. SQLite
keeps its synchronous local DatabaseSync transactions behind the Promise contract, its
schema/record format, exclusive ownership, WAL/FULL, quarantine and checkpoint behavior.
This does not claim nonblocking SQLite disk I/O.

## Authority and observation

Each Room owns one bounded FIFO, shared with its GameSession. Lobby changes, Human
commands, AI advances, replacements, timer expiry and aggregate deletion use that same
queue. Ordinary admission remains 64 by default (configurable within the existing
bound). Sixteen separately bounded FIFO positions are reserved for disconnect/expiry
control work so full client admission cannot prevent durable disconnect processing.
Unrelated Rooms have independent queues; MySQL has two connections and a bounded
64-entry connection acquisition queue. No global mutation lock or distributed authority
is introduced. Room creation reserves identity/capacity before yielding.

For a game command: validate authority and retry fingerprint at dequeue, compute the
candidate using the unchanged engine, retain its result and publication revision, await
the complete aggregate transaction, promote committed projections, publish redacted
views/events, then return success. A rejection that belongs in the retained cache also
awaits its aggregate commit. Exact retries read the retained outcome without a second
transition, RNG draw, revision or publication. Conflicting command IDs stay refused.

Mutable orchestration candidates are confined to their Room queue across awaits. Public
Room snapshots and lazy per-Human GameUpdate projections read the last committed
generation, including committed presence/controller overlays. A snapshot requested while
I/O is pending cannot reveal a candidate. The cache retains at most four committed
Human projections; AI receives a fresh redacted candidate view inside its queue.
The private export boundary is for persistence/tests, never transport.

A failed or uncertain write disposes authority and returns only a safe error; no candidate
publication/success follows. Other already-running database transactions may commit
before disposal completes, but cannot publish after failure. Restart is the resolution
for uncertain COMMIT: recover exact durable aggregates and retry the original request.
No automatic write retry is added. Record format and MySQL CAS revision/incarnation
guards remain unchanged.

## Presence, startup and shutdown

Disconnect immediately sets a separate transport pause/cancellation latch without
mutating the persisted candidate. Its grace deadline is captured at transport receipt,
not extended by queue/database delay. Its durable presence change is queued after any
already-admitted commit. A credential-validated resume immediately advances a transient
transport epoch and cancels a held AI choice; queued old-transport commands recheck it.
The replacement transport attaches only after the resume transaction. Concurrent
attachment requests on one socket are bounded to one. A socket lost while attachment
awaits storage is cleaned up through the normal leave/disconnect path.

Initialization awaits load, quarantine, recovery presence and expired-record processing
before readiness/listen. Production uses `InMemoryRoomService.open()`; explicit
`initialize()` also supports infrastructure composition. Constructor-created services
remain unready until initialization resolves. Live lifecycle tasks wait for that boundary.

Shutdown stops admission/cancels held AI, drains Room queues including pending commits,
awaits flush, then closes transports and storage. Disposal retains a drain promise so
failure/late shutdown cannot forget an in-flight transaction. MySQL acquisition/handshake,
queries and lock waits remain bounded at two seconds; schema/load operations at thirty
seconds and mutations/close at eight seconds. Expired acquisition destroys a late
connection; operation/query deadlines destroy their connection. Pool close is awaited.

## Verification and limits

The existing shared SQLite/MySQL recovery contract now awaits the same interface. Tests
retain exact state/RNG/cache/revision equality, private-view assertions, failure/replay,
deadline, replacement and closure coverage. Additional controlled awaits test candidate
isolation, Room FIFO revisions, disconnect deadlines/full admission, rejected commits,
and shutdown draining. Real MySQL adds two-Room latency/HTTP/heartbeat ordering and pool
connection cleanup evidence. See the async follow-up in V2_MYSQL_PROGRESS for final gates
and measurements.

There is still exactly one authoritative Node process. No Redis, replicas, external queue,
distributed lock, database format migration, new dependency or gameplay/protocol feature
is introduced. RDS, real network tail latency, failover, EC2, Vercel, public TLS, GoDaddy
DNS and production backups/restore remain unverified. Nothing is deployed by this task.
