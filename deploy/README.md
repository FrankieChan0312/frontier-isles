# Single-authority MySQL deployment templates

These are installable templates, not a deployment. No cloud account or endpoint is
contacted by repository qualification. Keep exactly one authority per database.

## Image and configuration

Build and qualify the normal Dockerfile on Linux. Record an immutable image digest.
The image still contains public assets because production validates STATIC_ROOT;
Vercel serves the public frontend in the split-origin topology. No separate backend
image is necessary. Dockerfile declares no implicit volume; the existing SQLite
compose.yaml explicitly retains its named /data volume. MySQL mounts only its CA.

Install compose.mysql-production.yaml at /opt/frontier-isles after resource approval.
Copy .env.mysql-production.example to /etc/frontier-isles/mysql.env outside source
control, owner root, mode 0600. Replace the image digest, private database hostname,
database name and runtime credentials. Never put credentials in command arguments,
VITE_ variables, an image layer, shell history, console output or a public directory.
Compose reads this file for interpolation; Node itself does not read dotenv files.
Use single-quoted env-file values when a password contains interpolation characters.

Install the trusted RDS CA bundle at /etc/frontier-isles/mysql-ca.pem, readable by
container UID 1000 and mounted read-only. CA certificates are public trust material;
do not put certificate private keys in this file. Normal service configuration fixes
MYSQL_TLS=required and MYSQL_SCHEMA_MODE=verify. Do not bypass identity verification.
CLIENT_ORIGINS must be the exact approved frontend HTTPS origin. No wildcard or
preview-origin suffix matching is supported.

Validate a real secret file only with `docker compose ... config --quiet`; expanded
configuration and `docker inspect` contain environment secrets. Restrict Docker/sudo
access as root-equivalent access. Preserve read-only root, capabilities/security
options, bounded resources/logging, loopback port 3001 and 30-second stop grace.

## One-shot schema authority

Provision the dedicated database and accounts separately. The application never
creates databases or users. Stop the sole authority before schema work. Supply a
different short-lived deployment credential to the one-shot command, never to the
HTTP server. Bootstrap an empty database with MYSQL_SCHEMA_MODE=initialize; audit
an existing expected schema with verify. The command is:

```text
npm run mysql:schema
```

It uses the already-built server output. Inside the qualified image its equivalent
entry point is `node server/dist/src/persistence/mysql-schema-command.js`. Run it in
a one-shot container with a private bootstrap env file and read-only CA mount; publish
no port. It exits with only MYSQL_SCHEMA_AUDIT_PASSED or MYSQL_SCHEMA_AUDIT_FAILED.
Normal production server configuration rejects initialize. Do not start the full
server as a substitute bootstrap command.

The audit requires direct SELECT, TRIGGER, EVENT and ALTER ROUTINE grants at database
or global scope to establish complete object visibility before examining metadata.
When partial_revokes is enabled, use direct literal database grants: global authority
can have database-specific restrictions and is not accepted as visibility evidence.
Initialize additionally needs CREATE and INSERT on the dedicated database. Role-only
metadata authority is deliberately not inferred. These privileges belong only to the
deployment account. It verifies the expected tables/columns/version/engines/durability
and refuses all triggers, routines, events and extra tables/views. An empty table list
with a routine/event is not treated as an empty database. Partial DDL fails closed;
never automatically drop, repair, downgrade or overwrite it.

The runtime grants for schema 1 are:

| Object | Runtime privileges |
| --- | --- |
| persistence_schema | SELECT and column-scoped UPDATE(id) for the admission row lock |
| rooms | SELECT, INSERT, UPDATE, DELETE |
| quarantine | SELECT, INSERT |

MySQL 8.4 requires a write privilege for SELECT ... FOR UPDATE. Granting UPDATE(id)
preserves the existing exclusive admission lock without granting schema-version
updates, DELETE or LOCK TABLES. The restricted-account tests exercise admission and
reject UPDATE(version). See [MySQL locking reads](https://dev.mysql.com/doc/refman/8.4/en/innodb-locking-reads.html).

Runtime receives no CREATE, ALTER, DROP, TRIGGER, EVENT, CREATE/ALTER ROUTINE, EXECUTE,
FILE, GRANT OPTION, account-management or global administrative rights. Require TLS
for the runtime account as well as at the server. Privileged audit runs before every
release and after any database administrative change. Revoke/lock deployment access
between maintenance sessions. Runtime's privilege-filtered trigger query is defense
in depth, not an independent proof of trigger absence. No audit protects against a
privileged operator modifying the schema afterward; control that authority operationally.

## Boot and failure policy

After installing Docker Engine/Compose and pulling the qualified digest, install
frontier-isles.service under /etc/systemd/system and enable it for multi-user.target.
The unit requires Docker and orders startup after network-online.target. Ensure the
host's appropriate wait-online service is enabled. Its oneshot invokes Compose with
--wait and performs no image build/pull. RemainAfterExit allows systemd stop/shutdown
to invoke Compose stop. There is no systemd Restart loop; Docker owns the bounded
on-failure:3 process restart policy. Exactly one Compose project/service is started.

Do not assume an active oneshot means the application is healthy. Alert on /ready,
container health/exits and safe persistence codes. Docker does not restart merely
because a healthcheck reports unhealthy. /health proves HTTP liveness; /ready proves
completed recovery and an authority still admitting work, not a fresh database write.
An idle RDS outage can remain undetected until an operation fails.

On persistent startup failure, exhausted retries or unhealthy readiness: restrict
admission at the reverse proxy, inspect fixed diagnostics and database/network/storage
health, correct the cause, then deliberately restart the sole service. An uncertain
COMMIT requires original-command replay after recovery; never invent a new command ID.
Do not delete/reset databases, clear quarantine, loop restarts or start a second owner.
Review failed oneshot startup explicitly: Compose may have left an unhealthy container
running. `systemctl stop` plus inspected Compose stop is the maintenance boundary.

Verify shutdown completes before an update; keep the prior compatible image. Scheduled
maintenance is not zero downtime. Back up first and rehearse restore separately as in
the persistence runbook. Laptops, Termius and personal VPSs are not service dependencies.

## Frontend and public proxy

vercel.json builds the existing Vite frontend from the repository root with the exact
VITE_REALTIME_URL=https://game-api.frankiesgroceryhk.shop. Use Node 24.19+ within 24.x,
npm ci, the declared build command and dist output. The value is public configuration,
not a credential. A URL change needs a rebuild and matching CSP/Origin review.
The declared CSP permits only self and the exact HTTPS/WSS API origin for connections;
nosniff, no-referrer and frame denial apply to all responses. Preview sites are not
implicitly authorized to use the backend. Single Player remains browser-local.

A future EC2 proxy must preserve Origin and Socket.IO paths/upgrades, permit supported
GET/POST transport traffic, use sufficient upstream timeouts (at least 75 seconds),
redirect HTTP to HTTPS and expose only /socket.io/, /health and /ready on the API host.
No reverse proxy, certificate or public DNS is installed by these templates. Frontend
and API subdomains alone may be added later; all existing ecommerce DNS stays intact.

## Local evidence and cloud limits

`npm run check:deployment` validates expanded Compose using synthetic credentials and
checks a real split-origin Vite build. `npm run check:boot` uses systemd-analyze verify
in a disposable Linux container with a syntax-only Docker dependency stub. It does
not boot a host or execute the unit's Docker commands.

`npm run test:mysql` includes distinct deployment/runtime accounts and the shared
recovery contract under restricted grants. `npm run smoke:mysql-production` builds
the real application image, runs owned local MySQL with disposable test TLS, invokes
the one-shot audit, then runs production with restricted credentials and no SQLite
file/volume. It checks static failures, HTTP/Socket.IO, durable gameplay, crash and
graceful restart, exact state/RNG/cache/replay, shutdown and private output. Resources
are labeled and removed by exact ownership; images/build cache remain local.
TLS qualification accepts the explicitly supplied test CA and intended synthetic
hostname, rejects an independent CA and mismatched hostname, and rejects a usable
plaintext fixture under MYSQL_TLS=required. The public CA file follows the production
read-only mount path; private keys stay in the owned temporary certificate directory.
The harness removes all certificate material and containers, and checks captured
output for generated passwords, private keys and session credentials before retention.

Local test certificates require the task's explicit local-only authorization. They
are not public certificates or RDS-chain evidence. AWS EC2/RDS, real network latency,
RDS TLS, public HTTPS/WSS, Vercel, GoDaddy, EC2 reboot and RDS backup/PITR/restore remain
unverified until separately authorized qualification records actual evidence.
