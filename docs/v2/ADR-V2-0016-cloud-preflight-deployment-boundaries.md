# ADR-V2-0016: Local cloud-preflight deployment boundaries

- Status: Accepted; required local remediation gates passed (cloud validation remains separate)
- Date: 2026-09-17
- Extends: ADR-V2-0013/0014/0015
- Scope: local preparation only; no cloud deployment or public TLS provisioning

## Provider-aware production composition

MySQL configuration neither requires nor validates PERSISTENCE_FILE. The production
HTTP server receives a private SQLite path only for SQLite. STATIC_ROOT remains
mandatory in production and still validates a real confined index/asset build.
SQLite retains lexical and realpath private/public separation; no dummy file is used.

Keep the existing SQLite Compose reference. A separate compose.mysql-production.yaml
explicitly supplies backend environment, verified TLS and schema verify mode. Its only
bind mount is a read-only CA bundle and its published port is loopback 3001. The shared
Dockerfile declares no implicit volume, avoiding a hidden unused /data volume for MySQL;
SQLite's named volume remains explicit in compose.yaml. No backend-only image is added.

## Deployment authority is distinct from runtime authority

MySQL filters information_schema by privileges. A zero trigger count under DML-only
credentials cannot establish trigger absence. The one-shot mysql:schema entry point
requires direct database/global SELECT, TRIGGER, EVENT and ALTER ROUTINE authority,
proves that visibility, rejects programmable objects and validates the schema. Bootstrap
requires additional CREATE/INSERT rights, only for an empty database. No HTTP, Socket.IO,
Room recovery or payload logging runs in this process. Production HTTP refuses initialize.

Runtime has SELECT and column-scoped UPDATE(id) on persistence_schema for the existing
exclusive admission lock, DML on rooms and SELECT/INSERT on quarantine. It cannot update
the schema version. With partial_revokes enabled, deployment auditing requires direct
literal database grants and does not infer visibility from global grants.
It has no schema, programmable-object, FILE, GRANT or user-administration rights. Runtime
continues checking visible structure/durability and rejecting visible triggers as defense
in depth; it does not claim a full privileged audit. Audit before each deployment and
after administrative schema changes; lock/revoke deployment access between maintenance.
No new audit table, migrations, automatic destructive repair or privileged runtime is added.

## Hosting configuration and recovery

vercel.json binds the build to the requested public HTTPS API origin and supplies exact
HTTPS/WSS connect-src and existing nosniff/referrer/frame restrictions. Backend Origin
admission remains exact. Preview origins receive no wildcard exception. V1 remains local.

The Linux boot template is a systemd oneshot after Docker/network-online with a fixed
Compose project, prevalidated configuration, bounded readiness wait and graceful stop.
Docker owns on-failure:3 process restarts; systemd adds no competing Restart loop.
An active oneshot is not a readiness monitor. Unhealthy/persistence failures alert an
operator; they never trigger data deletion, silent repair or a second authority.

Local systemd-analyze uses a Docker dependency stub solely for syntax. It does not prove
EC2 reboot, service installation, DNS/TLS, RDS connectivity, backup or PITR behavior.
Real local production MySQL/TLS/restricted-account evidence is recorded separately in
V2_MYSQL_PROGRESS; cloud boundaries remain unverified.
The human clarification authorizes disposable synthetic local CA/server material only,
resuming HEAD 91542fcd599ed18283766ba9c6403649a0fdaf6b without resets. Generated material
must remain in owned temporary storage, never enter Git or a global trust store, and
be removed with all task containers after qualification. This does not authorize public
CA requests, RDS connections, AWS resources or cloud deployment. See the subsequent
acceptance record in V2_MYSQL_PROGRESS for actual gate outcomes.

Metadata visibility references:
[MySQL triggers](https://dev.mysql.com/doc/refman/8.4/en/information-schema-triggers-table.html),
[routine privileges](https://dev.mysql.com/doc/refman/8.4/en/stored-routines-privileges.html),
[event privileges](https://dev.mysql.com/doc/refman/8.4/en/events-privileges.html),
[partial revokes](https://dev.mysql.com/doc/refman/8.4/en/partial-revokes.html),
[locking reads](https://dev.mysql.com/doc/refman/8.4/en/innodb-locking-reads.html).
