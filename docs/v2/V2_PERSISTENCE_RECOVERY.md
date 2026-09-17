# Multiplayer Persistence and Recovery Runbook

For the production image, private volume, readiness, stop/backup/restore and compatible-image
rollback procedures, see [V2 Deployment](V2_DEPLOYMENT.md). Production requires explicit absolute
private/public paths and an Origin allowlist. Startup over the 64-Room cap fails without resetting
records; oversized records are quarantined in SQL before allocating private payloads in JavaScript.

## Supported storage

Run exactly one Node 24.19+ process within the Node 24 line. The default `PERSISTENCE_PROVIDER=sqlite` uses the bundled SQLite
adapter with WAL, FULL synchronous commits, exclusive process ownership and local persistent disk.
`PERSISTENCE_FILE` defaults to `data/frontier-isles.sqlite`, relative to the server process working
directory (`server/data/` when using the workspace development/start scripts). Set an explicit
absolute path for a deployment. Do not use a network share, ephemeral container layer, cloud
object store or multiple server replicas. The data directory must be writable only by the service
account/operators. Creation requests private directory/file modes on platforms supporting them;
Windows operators must set equivalent NTFS ACLs. Never place the directory in the static web root.

Version 1 stores each Room, session-token digests and optional GameSession in one atomic record.
The record includes exact core GameState/RNG, original four-seat mapping, current Human control,
AI replacement and orchestration metadata, deadlines and the bounded per-session command cache.
It excludes raw ResumeTokens, socket identities/objects, handles, callbacks and browser state.
Records have strict schemas, semantic invariant checks, canonical sorted-key JSON, a 2 MiB limit
and a SHA-256 checksum. The checksum detects accidental corruption; it is not protection from
an operator who can rewrite the private database. Stored hands, cards, deck order and digests
are private. Never upload the database or quarantine table to a public issue, test report or client.

## Normal restart

1. Keep the same database and service origin. Preserve the volume across process/container restarts.
2. Stop the server gracefully (`SIGINT`/`SIGTERM` on supported hosts). It stops admission and
   awaited AI work, settles its queue, flushes committed records and closes sockets/HTTP/storage.
3. Restart the server with the same configuration and supported runtime. Recovery finishes before
   it accepts connections. It does not regenerate GameState or RNG.
4. Existing tabs resume with their sessionStorage credential. Previously connected sessions get
   `RESTART_RECOVERY_GRACE_MS` (default 120,000 ms); previously disconnected sessions keep their
   saved deadline, and expired credentials are not revived. Room revision is retained at load and
   increments on accepted resume. New public presence advances Game publication revision.
5. Active games remain paused until every required Human resumes or the Host resolves an expired
   seat. AI replacement and original-Human denial remain irreversible. Waiting/abandoned/finished
   records past their original deadline are removed transactionally during startup or timed cleanup.

A command is durable before its success acknowledgement and public effect. A crash after commit
but before acknowledgement may leave the browser uncertain; an exact retained retry returns the
original result, including after restart. Game state and that result are committed together. The
default cache retains 128 results per Human in insertion order; it is not a permanent event log.

## Failures and quarantine

- `PERSISTENCE_WRITE_FAILED`: the service stops mutation authority and retains the last durable
  record. Check free disk space, volume access, service-account permissions and disk health. Repair
  access, then restart; do not delete the database to make startup succeed.
- `PERSISTENCE_OPEN_FAILED` / `STARTUP_FAILED`: check configuration, runtime, ownership/permissions,
  database version and integrity. Only one process may own the file. An unreadable, unsupported,
  unrelated or structurally inconsistent SQLite database is not replaced by a fresh store.
- `PERSISTENCE_QUARANTINED`: the count identifies malformed, checksum-invalid, future-version or
  conflicting-session records isolated in the private `quarantine` table. Other valid Rooms load.
  Keep a copy for operator investigation. A quarantined game is unavailable; it is never reset into
  a new game automatically. Do not edit a record into apparent validity or expose its payload.

Diagnostics intentionally contain codes/counts rather than tokens, identities, state, storage
paths or exception stacks. A database-level failure requires operator action; repeatedly restarting
with the same broken volume cannot repair it. Liveness alone does not prove writable persistence.

## Private backup and restore

Use an offline backup for this single-process alpha. Stop the process and verify that it exited.
Successful shutdown checkpoints WAL and closes SQLite. Copy the closed database into a private
backup directory outside any web-served directory, preserving restrictive permissions/ACLs. If
shutdown was interrupted, preserve the database and any `-wal`/`-shm` companions together before
investigation; never discard a non-empty WAL or copy only the main file from a running process.
An SQLite-aware recovery/open on a private copy can replay committed WAL transactions safely.

For restore, keep a private copy of the current database and companions first, stop every owner,
and place the complete chosen backup at the configured path. Start the matching application/runtime,
check recovery diagnostics, then resume test tabs before reopening the alpha. Restoring an older
backup can lose commands acknowledged after that backup and cannot resurrect missing tab credentials.
Backups and restore rehearsals are operator responsibilities; permanent loss of the volume is not
covered by an availability guarantee. A deployment reference and container smoke follow in V2-12.

## Upgrade boundary

Persistence schema 1 has no migration from an older multiplayer format. Unknown future versions
are refused or quarantined without guessing their meaning. Before an upgrade, stop and back up
the store; keep the matching application version. A future schema change requires an explicit
validated migration/ADR and rollback plan. Do not downgrade application code against a newer
store; restore a compatible backup and accept its documented data-loss boundary instead.

## Local verification

Run `npm run test:recovery` for strict records, rollback, forced writer/process restart, exact
private-state recovery, idempotent replay and cleanup. It uses temporary stores inside the
repository and real Socket.IO clients. Run `npm run check:all`, both simulation scripts and all
browser suites for regression acceptance. V1 localStorage saves and LocalGameGateway are independent
of server storage, downtime, recovery, credentials and this schema.

## MySQL provider (local qualification; future RDS)

`PERSISTENCE_PROVIDER=mysql` selects a Promise-based aggregate repository using mysql2/promise
directly. [ADR-V2-0015](ADR-V2-0015-asynchronous-authoritative-persistence.md) replaces the
historical synchronous worker bridge. SQLite implements the same asynchronous contract while
retaining its synchronous local transactions. The strict aggregate format is unchanged.

Room/GameSession/lifecycle operations share one bounded FIFO per Room. The candidate aggregate,
including retained result and publication revision, is committed before new public views/events
or success acknowledgement. Snapshot reads retain the prior committed generation during I/O.
An unrelated Room, HTTP and Socket.IO timers can progress while one Room awaits MySQL.
Immediate disconnect/resume transport cancellation is distinct from queued durable presence;
database delay does not extend the reconnect deadline. Recovery completes before readiness.

Backend environment variables (never `VITE_`):

| Variable | Meaning |
| --- | --- |
| `PERSISTENCE_PROVIDER` | `sqlite` (default) or `mysql` |
| `MYSQL_HOST` | Required DNS hostname; no URL or embedded credential |
| `MYSQL_PORT` | Integer 1–65535; default 3306 |
| `MYSQL_DATABASE` | Dedicated existing database, required |
| `MYSQL_USER`, `MYSQL_PASSWORD` | Service credentials supplied privately by the environment |
| `MYSQL_TLS` | `required` by default; `disabled` only for nonproduction loopback tests |
| `MYSQL_TLS_CA_FILE` | Required trusted PEM CA bundle for TLS; mount privately |
| `MYSQL_SCHEMA_MODE` | `verify` default; `initialize` explicitly bootstraps an empty database |

MySQL does not use `PERSISTENCE_FILE`. The SQLite Compose reference does not automatically forward
MySQL configuration. Node reads environment variables directly, without loading dotenv files.
Production still requires the existing public static-root and Origin configuration. Split-origin
hosting is future deployment work, not an implied change to that deployment contract.

Provision an empty dedicated database separately; this application never creates a database or
account. With temporary bootstrap privileges, run `MYSQL_SCHEMA_MODE=initialize` once. It creates
three InnoDB tables and schema version 1 only if no table exists. Then use `verify` and a service
account limited to SELECT/INSERT/UPDATE/DELETE on those tables (plus the metadata visibility needed
for startup checks). Do not grant normal runtime DDL/admin access. Partial DDL, unknown versions,
unrelated tables, changed structures or unsupported durability settings fail closed; investigate
privately rather than dropping or recreating existing data. No SQLite-to-MySQL copy tool is added.

Each `rooms` row has canonical payload bytes/checksum, a storage revision and incarnation guard.
The canonical private aggregate still carries the exact state/RNG, Room/publication revisions,
Human/session digests, AI replacement, deadlines and retained results. Recovery retains the same
pause/resume/deadline policy. A rejected stale write, timeout or lost COMMIT reply disables live
authority. The database might have committed an uncertain command: repair access and restart,
then use the original command retry and a fresh snapshot. Never blindly resubmit a new command ID.

MySQL transactions require durable InnoDB flush and binlog settings of 1. Quarantine is private;
malformed/future/checksum-invalid and oversized records are moved atomically without private logs.
Stop/shutdown drains Room queues and awaits pool closure after accepted commits. There are no
fire-and-forget persistence writes. Each schema/load operation has a 30-second bound;
mutations/close eight seconds; acquisition, handshake and query operations two seconds.
The pool has two connections and a bounded acquisition queue. A timeout requires investigation/restart.

Run `npm run test:mysql` from the root. The harness starts only a uniquely named, labeled,
digest-pinned MySQL 8.4 container, uses a random loopback port and generated test credentials,
and keeps `frontier_isles_mysql_test` on temporary tmpfs. It never targets an existing database.
Shared adapter recovery contracts, hostile storage cases and actual server kill/restart/replay
run against that real service. The harness verifies ownership before removing only its own
container; it creates no durable volume and records cleanup in `server/logs/mysql-harness-summary.json`.
No database dumps are retained. A failed prerequisite/test is a failed gate, never a skip.

For future RDS operation, separately rehearse encrypted snapshots/PITR, retention, access control,
restore into an isolated instance, matching schema/application version and resumed-player recovery.
Restoring an older backup loses later acknowledged commands. Define RPO/RTO and verify them before
deployment. RDS TLS, backup/restore, failover and EC2 network behavior have not been qualified here.
