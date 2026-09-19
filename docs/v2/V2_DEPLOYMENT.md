# V2 Online Multiplayer Alpha Deployment Reference

The local cloud-preflight remediation adds a separate
[MySQL deployment template and operating procedure](../../deploy/README.md),
`compose.mysql-production.yaml`, a oneshot systemd boot unit and Vercel split-origin
headers/build configuration. These are local preparation, not cloud deployment.
The original SQLite Compose workflow below remains supported. MySQL production no
longer validates an unrelated SQLite path; production runtime requires schema verify.

This repository prepares a local, single-process production artifact. No cloud account, image
publication, external endpoint or deployment is created by qualification. Human deployment UAT
must happen separately. Supported runtime: Node 24.19+ within Node 24; image pins 24.19.0 Debian slim.

## Local production reference

With Docker running, from the repository root:

```sh
docker compose --env-file .env.production.example build
docker compose --env-file .env.production.example up -d
docker compose --env-file .env.production.example ps
curl http://127.0.0.1:3001/ready
docker compose --env-file .env.production.example logs --tail 50
docker compose --env-file .env.production.example stop
```

These are operator commands, not actions performed against a hosting account. The Compose service
binds loopback only, runs one non-root Node process, preserves the named `frontier-data` volume,
uses a read-only root with a bounded temporary filesystem, drops capabilities, limits CPU/memory/
PIDs, rotates logs and grants 30 seconds for SIGTERM shutdown. `on-failure:3` bounds repeated
startup failures. Never use `down -v` during normal operation: it removes the private durable volume.
Never start a second replica or share this SQLite file between processes/network filesystems.

`/health` reports HTTP liveness. `/ready` returns 200 only after successful recovery while mutation
admission remains available, otherwise 503. Readiness is not a player-count/capacity/SLO promise.
Startup failure exits with safe fixed diagnostic codes; inspect the recovery runbook before any reset.

For automated local image and restart qualification:

```sh
npm ci
npm run smoke:container
```

The smoke builds by image ID without creating a tag, runs a uniquely named loopback-only container
and private temporary bind volume, verifies non-root/read-only execution and private-route denial,
creates four Humans, commits one legal command, SIGKILLs, restarts, resumes exact state/RNG and
replays the command once, then checks graceful flush. It removes its own container/temp data and
never pushes the image. Docker CLI may be selected with `DOCKER_CLI`. The local image/build cache
remains available; no unrelated container or image is modified.

For direct Node operation, first `npm ci`, `npm run build` and `npm run build:server`. Set
`NODE_ENV=production`, `PORT=3001`, `CLIENT_ORIGINS=https://your-host.example`, absolute
`STATIC_ROOT` to the built `dist` and absolute `PERSISTENCE_FILE` to a private local `.sqlite` file
outside that public directory, then `npm start --workspace @frontier-isles/server`. The service
does not automatically parse dotenv files. Shell syntax for exporting environment varies by OS.

## Same origin and reverse proxy

The production Vite build defaults to `VITE_REALTIME_URL=same-origin`, resolved from the browser
origin. No secret is a `VITE_` value. If a split origin is deliberately built, set an explicit HTTP(S)
`VITE_REALTIME_URL` at build time and include the exact frontend origin in `CLIENT_ORIGINS`.
That separate frontend host must also permit the selected realtime origin in its own `connect-src`
CSP. The single-image reference deliberately uses same origin and a self-only connection policy;
split hosting is not qualified by this reference. Changing frontend URL requires rebuilding.

Terminate HTTPS at the operator's reverse proxy; forward `/`, `/assets/*`, `/health`, `/ready` and
`/socket.io/` to `127.0.0.1:3001`. Preserve the browser's Origin, use HTTP/1.1 upstream and WebSocket
Upgrade/Connection forwarding, allow GET/POST polling, disable response buffering for Socket.IO,
and use an upstream read timeout greater than Engine.IO's ping interval plus ping timeout
(use at least 75 seconds for the defaults). Set an appropriate proxy body/header/connection limit
as an additional boundary. Redirect external HTTP to HTTPS. Configure the exact HTTPS public
origin; no `*`, null origin, URL path or client-controlled suffix match is supported.

The application does not trust `X-Forwarded-For` for identity, Host authority or limiter keys and
does not store IP addresses. Forwarded headers do not create a trusted-proxy authentication layer.
Keep the backend loopback/private; protect proxy/admin access separately. The local HTTP smoke
does not validate a future operator's TLS, DNS, certificate renewal or public firewall rules.

## Backup, restore, upgrade and rollback

1. Announce downtime and stop the sole service gracefully. Confirm `SHUTDOWN_COMPLETE` and that
   the process/container is stopped. This flushes/checkpoints accepted data. Do not copy a live
   SQLite main file alone while its WAL may contain accepted changes.
2. Back up the entire stopped private volume, including any `-wal`/`-shm` companions if present,
   to an access-controlled encrypted backup destination. Record image/source revision, schema
   version 1 and Node version separately. Never place the backup in the public asset directory.
3. Test restore into a separate empty private volume while the original remains stopped. Keep
   exactly one owner per copy; confirm `/ready`, known Room resume and safe recovery diagnostics.
4. Before an upgrade, retain both the old image ID and that private backup. Run all acceptance
   checks locally. This alpha has no schema migration; unknown future formats fail closed.
5. To roll back, stop the new service, retain its data for investigation, and start the prior
   compatible image with the pre-upgrade backup in a separate private volume. Do not downgrade
   an unknown schema in place or overwrite the only good copy. Rollback loses changes accepted
   after that backup; communicate this boundary to participants.

Previously connected Humans receive a 120-second restart window; previously disconnected/expired
deadlines are not extended. Plan restart timing accordingly. Private backup access is operator-only.
See [persistence recovery](V2_PERSISTENCE_RECOVERY.md) for quarantine and corruption procedures.

## Logs and operational bounds

Production writes structured diagnostics to stdout/stderr. Compose retains three 10 MiB log files;
operator collectors must preserve redaction and bounded retention. Never enable DEBUG/NODE_DEBUG.
Monitor readiness failures, quarantine/write/startup failures, rate-limit counts, disk free space and
container memory. A Room cap of 64 and transport cap of 320 are safety bounds, not measured internet
capacity. The local load smoke qualifies only its recorded eight concurrent Rooms / 24 sockets.
Disk-full and permanent-volume-loss recovery require operator action; no availability guarantee,
automatic remote backup, cross-machine session transfer or multiple replicas is provided.

## MySQL migration boundary

The additional provider is documented in the [recovery runbook](V2_PERSISTENCE_RECOVERY.md).
SQLite remains supported and is still the default for the existing same-origin Compose reference.
MySQL qualification uses Docker only for an isolated local test database (`npm run test:mysql`);
it does not require a future player's or operator's laptop to run Docker in production.

The intended future topology is Vercel static React/Vite frontend, one Dockerized Node/Socket.IO
authority on EC2, and RDS MySQL, with the user's GoDaddy-managed public domains. This goal neither
provisions nor deploys that topology. No real endpoint or credential is committed.

Verified paths are the accepted local SQLite implementation and, only when recorded as passing in
[MySQL acceptance](V2_MYSQL_PROGRESS.md), the isolated local MySQL integration/restart path.
AWS RDS, EC2 deployment, Vercel split-origin hosting, GoDaddy DNS, public TLS/WebSocket operation
and RDS backup/restore remain **not verified**. Existing historical Goal C reports describe SQLite
and must not be read as historical MySQL evidence.

Before any RDS deployment: review ADR-V2-0015's asynchronous authority boundary; measure real network latency,
tail stalls and capacity; configure trusted CA/hostname verification, least-privilege accounts,
private networking, encryption, durable flush/binlog settings, secrets delivery and tested backups.
Only one authoritative server process is supported. Optimistic row guards do not coordinate two
Socket.IO authorities. A future split frontend/backend release also needs explicit Origin/CSP,
proxy, public DNS/TLS, readiness and recovery qualification. No such rollout is authorized here.
