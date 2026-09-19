# ADR-V2-0012: Transactional Multiplayer Recovery

- Status: Accepted
- Date: 2026-09-07
- Scope: V2-11

## Storage and atomic boundary

Use one embedded SQLite database through Node 24's built-in `node:sqlite` `DatabaseSync` API.
The inspected Windows runtime is Node 24.19.0 with SQLite 3.53.3. This requires no external
database service, native npm compilation, Redis or additional storage adapter. Node documents
this API as release candidate; pin the supported Node 24 minor baseline and verify the same
runtime family in the Linux deployment smoke. The existing Zod version becomes a direct server
dependency for private persistence validation; no private state schema enters browser contracts.

A focused MultiplayerRepository stores one Room aggregate: Room revision/Host/seats/deadlines,
valid Human session identities and token digests, and optional GameSession state, ownership
overlay, AI counters and bounded command results. Synchronous transactions use WAL, FULL
synchronous durability and exclusive process ownership. No transaction spans an awaited AI
choice. Other Rooms retain independent execution queues. A successful durable commit precedes
every acknowledgement and publication of a changed authoritative state, including rejected
game-command results added to the idempotency cache. The transport pipeline commits Human state,
its result and publication revision together once, before any observer or acknowledgement. No
asynchronous work can intervene between execution and that commit. The focused command-only
boundary commits directly when no publication is requested.

The in-memory adapter implements the same repository contract for focused tests. Reject external
databases because single-process alpha needs local disk only. Reject custom atomic JSON-file
rotation because transactional Room/game/cache/session consistency, Windows replacement and
recovery would require more custom crash-safety code. Reject a native SQLite npm wrapper because
the installed Node runtime already supplies the required transactional interface.

## Format and failure behavior

Persistence version 1 is separate from the core GameState and wire protocol versions. Validate
strict serializable shapes, canonical seat/session/controller relationships, bounded cache
entries and existing game invariants. Serialize with sorted object keys, preserve ordered arrays,
and checksum the canonical JSON with SHA-256. Store integer epoch deadlines, never Date objects,
socket IDs, live handles/callbacks, browser state or raw ResumeTokens. SQLite prepared statements
bind data. Refuse invalid writes before replacing accepted data. Check database integrity at open;
isolate malformed, checksum-invalid and unknown-future records in a private quarantine table.
Continue recovering unrelated valid records. A structurally corrupt database fails startup with
an actionable public-safe operator error and is never silently replaced by an empty database.

A failed commit stops the in-process authority before exposing uncommitted state. The last
durable record remains the recovery authority; no success acknowledgement is issued. Operators
must repair disk access and restart. Files and backups are private server data and require a
local persistent volume with reliable SQLite locking/fsync; network filesystems are unsupported.
Hardware or permanent volume loss is outside the availability guarantee.

## Restart and shutdown

Restore exact GameState, RNG, Room revision, original game seats, mappings, replacement profiles,
publication revision and AI/idempotency bookkeeping. Reconstruct live timers from deadlines.
Prior connected sessions become disconnected and receive a 120-second restart resume window
(`RESTART_RECOVERY_GRACE_MS`); previously disconnected sessions retain their original deadline.
Already expired sessions are never revived. Waiting/abandoned/completed expiry remains bounded
by its saved deadline and is processed before admitting clients. Recovery does not increment
Room revision or regenerate game state. Persist recovery presence before admitting clients.

Existing tab-scoped tokens authenticate against stored digests. Active games remain paused until
all required Humans resume or the Host resolves expired seats under ADR-V2-0011. No automatic
AI runs before presence clears. Exact retained command retries after recovery keep their original
result and cannot produce another transition. Original Human ownership remains invalid after AI
replacement. Snapshot resync delivers only the current redacted PlayerView.

Graceful shutdown stops admission, interrupts awaited AI choices without executing them, settles
queued work safely, flushes accepted records, and closes Socket.IO/HTTP/storage. Process shutdown
does not persist a game closure or delete recoverable Rooms. Transaction interruption preserves
the last committed generation. Tests use temporary stores inside the repository, actual restart,
injected write failures and a killed writer transaction, plus all accepted regression gates.

References: [Node 24 SQLite API](https://nodejs.org/docs/latest-v24.x/api/sqlite.html),
[SQLite atomic commit](https://www.sqlite.org/atomiccommit.html),
[WAL durability](https://www.sqlite.org/wal.html),
[synchronous modes](https://www.sqlite.org/pragma.html#pragma_synchronous).
