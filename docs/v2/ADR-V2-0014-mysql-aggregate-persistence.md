# ADR-V2-0014: MySQL aggregate persistence

Historical decision: its synchronous worker boundary is superseded by
[ADR-V2-0015](ADR-V2-0015-asynchronous-authoritative-persistence.md). The original
implementation evidence and storage/security decisions below are preserved.

- Status: Implemented for local qualification; pending Human architecture review
- Date: 2026-09-17
- Scope: authorized MySQL persistence goal; no deployment

## Decision

Retain `MultiplayerRepository` and its synchronous `load/save/remove/flush/close` boundary.
SQLite remains the default and retains its accepted format, WAL/FULL behavior and exclusive
file ownership. Provider selection adds MySQL using pinned `mysql2` 3.24.4, with no ORM or
migration framework. This goal authorizes the additional provider in place of ADR-V2-0012's
earlier SQLite-only selection; it does not change its aggregate or commit ordering.

The MySQL adapter owns one worker thread and a pool capped at two connections. Driver I/O runs
in that worker; the authority waits synchronously for the completed operation. Connection
acquisition, handshake, queries and transaction control have two-second bounds; row lock waits
are also two seconds. The bridge bounds startup/recovery to 30 seconds and mutations/close to
eight seconds. A deadline or failed/uncertain commit poisons the adapter and stops authority.
There is no automatic write replay or reconnect-and-retry after an uncertain commit.

This intentionally preserves the existing no-yield candidate/commit/ACK/publication boundary
and all synchronous lifecycle callbacks. A database commit completes before any observer sees
the resulting state or retained result. A process crash after commit can lose the ACK; recovery
and an exact retained retry return the original result without another transition or RNG draw.

## Storage and concurrency

Use three InnoDB tables in a dedicated database: `persistence_schema`, `rooms`, `quarantine`.
Schema version 1 is separate from record format 1. Each Room row stores its binary six-byte
key, an unsigned storage revision, a 16-byte incarnation, canonical UTF-8 JSON as MEDIUMBLOB,
and its SHA-256 checksum. The existing strict record validator and 2 MiB bound are unchanged.
Storage revisions advance even when Room revision is unchanged (for example retained rejections).
The incarnation uses infrastructure-only cryptographic entropy on insert to prevent an old
writer from overwriting a deleted/recreated key. Neither token enters the canonical aggregate,
game state, game RNG, views or gameplay ordering.

Insert fails on an existing key; update/delete compare both loaded revision and incarnation.
Ordinary updates lock only their Room. A short metadata-row lock serializes capacity admission
for new Rooms. This is a stale-write safeguard, not support for multiple authoritative servers.
The sole authority must restart after a persistence failure; a second server is unsupported.

Quarantine moves and deletion occur in one transaction. Oversized bytes remain inside SQL,
before private payload allocation. Startup enumerates binary keys deterministically and checks
canonical bytes, checksums, aggregate coherence and cross-Room session collisions. Unrelated
valid Rooms recover; invalid/future records are never repaired or regenerated. AUTO_INCREMENT
is used only for a private quarantine identifier, never authoritative order or gameplay.

## Bootstrap, security and operations

Default schema mode `verify` refuses an empty or incompatible database. Explicit `initialize`
creates version 1 only when the dedicated database has no tables. MySQL DDL commits separately:
interrupted initialization leaves a partial schema that subsequent startup refuses. No automatic
reset, missing-table repair, downgrade or data-copy migration exists. A future version needs an
explicit migration and rollback decision. Runtime startup verifies tables, engines, columns,
primary keys, version, absence of triggers and durable server settings.

Require `innodb_flush_log_at_trx_commit=1` and `sync_binlog=1`. Protect database storage and backups;
an ACK cannot promise survival of permanent database/storage loss. All data parameters use
prepared statements. Transaction control uses the driver's BEGIN/COMMIT/ROLLBACK API because
MySQL does not prepare START TRANSACTION. SQL identifiers and DDL are application constants.

Production requires a DNS hostname, a supplied trusted CA, certificate validation, hostname
verification and TLS 1.2 or newer. Plaintext is allowed only on loopback outside production.
Configuration and driver exceptions never enter diagnostics. Worker output is discarded;
only fixed error codes/counts cross its diagnostic boundary. Private rows/quarantine contain
hands, RNG, session digests and results; they must never be published or served as web assets.

## Tradeoff and rejected alternatives

The synchronous bridge blocks the authority event loop during network I/O. It preserves
accepted orchestration at the cost of remote latency sensitivity. Local qualification is not
an RDS performance/SLO claim. Measure intended EC2-to-RDS latency, tail stalls, command/heartbeat
timeouts and capacity before deployment; do not call this horizontally scalable. A future fully
asynchronous boundary would require a separately reviewed lifecycle/observation design.

Reject fire-and-forget persistence because it acknowledges uncommitted state. Reject a broad
async Room/GameSession rewrite within this goal, a second rules implementation, game-table
normalization, database JSON reserialization, ORM, Redis and cloud provisioning.

See [recovery runbook](V2_PERSISTENCE_RECOVERY.md), [deployment boundary](V2_DEPLOYMENT.md),
[local acceptance evidence](V2_MYSQL_PROGRESS.md). Driver behavior was checked against the
installed version and [mysql2 documentation](https://sidorares.github.io/node-mysql2/docs).
Durability assumptions follow [MySQL InnoDB documentation](https://dev.mysql.com/doc/refman/8.4/en/innodb-parameters.html).
