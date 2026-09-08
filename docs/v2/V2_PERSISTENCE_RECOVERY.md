# Multiplayer Persistence and Recovery Runbook

For the production image, private volume, readiness, stop/backup/restore and compatible-image
rollback procedures, see [V2 Deployment](V2_DEPLOYMENT.md). Production requires explicit absolute
private/public paths and an Origin allowlist. Startup over the 64-Room cap fails without resetting
records; oversized records are quarantined in SQL before allocating private payloads in JavaScript.

## Supported storage

Run exactly one Node 24.19+ process within the Node 24 line. Production uses its bundled SQLite
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
