# ADR-V2-0013: Alpha Security and Single-Process Deployment

- Status: Accepted
- Date: 2026-09-08
- Scope: V2-12

## Decision

Ship one Node 24.19.0 Debian slim image containing the built frontend, Socket.IO server, game
packages and production dependencies. One process owns one local SQLite volume. The browser uses
its own origin in production; development retains the explicit local server default. A TLS reverse
proxy forwards HTTP and WebSocket traffic to the loopback-bound container. No distributed adapter,
replicas, cloud resources or deployment are introduced.

Production requires explicit absolute private `PERSISTENCE_FILE`, absolute public `STATIC_ROOT`
and one to eight exact `CLIENT_ORIGINS`. The data path must be outside the public root. Debug
library logging is rejected. Missing/unreadable build or storage fails startup with fixed operator
guidance. `/health` means the HTTP process is alive; `/ready` additionally requires successful
recovery and a service still accepting work. Shutdown and persistence failure remove readiness.

## Network limits

Enforce Origin on Engine.IO handshakes, polling and upgrades, including direct WebSocket requests.
Production rejects missing and `null` Origins. CORS is an exact credentialed allowlist. HTTP permits
originless read-only asset/health requests for navigation and health checks; any supplied Origin
must match. An Origin is an admission restriction, never authentication; non-browser clients can
forge it. Resume-token digests and current attached session ownership remain authoritative.

Cap Rooms at 64, attached transports at 320 and valid Human limiter entries at 256. Limits use
monotonic token buckets, with no per-key timer or IP address storage. The full rate table is in
the security document. Transport budgets charge malformed, unknown and missing-ack packets.
Session budgets use only an attached valid server identity and survive newest-tab replacement.
Global budgets constrain deliberate transport rotation; no claim of distributed DoS protection is made.

Socket.IO input is 16 KiB, at most 12 nested levels and 512 visited JSON nodes. Reject reserved
prototype keys, accessors, cycles and non-JSON values before strict schemas. HTTP rejects bodies,
limits headers to 8 KiB and paths to 2048 characters, and applies bounded timeouts. Serve only the
built index and flat allowlisted asset filenames after realpath confinement. No source, map, fixture,
debug, cache or persistence route exists. Responses set CSP, nosniff, frame and referrer restrictions.

At most 64 private publication receipts may be outstanding per socket for five seconds. Excess
backlog or a failed receipt disconnects the slow transport; the normal pause/resume/snapshot policy
recovers authority. Each receipt-bearing update remains excluded from Socket.IO recovery storage.
Cached redacted views remain limited to four current players; idempotency retains its existing
per-Human FIFO bound and mutation queues their existing per-game limit.

## Storage and errors

Reject databases above the Room cap without resetting them. Before allocating payload strings,
quarantine oversized records in SQL; load at most one 2 MiB record at a time after bounded key
enumeration. A failed checkpoint still closes the database and reports a safe failure. Long lifecycle
deadlines are clamped to Node's timer range and rechecked by the existing lifecycle callbacks.

Logs use fixed diagnostic codes and selected nonnegative counters/port only. Arbitrary messages,
objects, errors, stacks, IDs, tokens, digests, paths and state never pass the production formatter.
Handler guards contain synchronous and asynchronous errors. Attach session authority before an
asynchronous channel join, and recheck newest transport before acknowledgement/publication.
Failed attachments remove only the still-current attachment. This repairs a prior lobby race.

## Qualification and tradeoffs

Use deterministic unit tests, hostile real Socket.IO traffic, all accepted browser flows, additional
three/four-Human setup, actual production-entry restart with pending decisions, bounded resource
load, and an actual local Linux container crash/restart. Test fixtures remain Node test files and
are absent from the runtime image. Native opener tab duplication keeps credentials out of
Playwright action arguments. Audit retained artifacts as private test data; do not publish traces,
screenshots or raw database files. See the acceptance report for measured results and limitations.

Run as non-root with read-only image filesystem, private writable volume, dropped capabilities,
bounded container resources, rotated logs, readiness healthcheck and 30-second stop grace.
Anonymous room access, finite single-process capacity and permanent-volume-loss risk remain alpha
limitations. Deployment and external Human UAT remain a separate operator action.

## Primary references

- [Socket.IO CORS and WebSocket admission](https://socket.io/docs/v4/handling-cors/)
- [Socket.IO server options](https://socket.io/docs/v4/server-options/)
- [Node HTTP server limits and shutdown](https://nodejs.org/docs/latest-v24.x/api/http.html)
- [Docker multi-stage builds](https://docs.docker.com/build/building/multi-stage/)
- [Compose stop grace](https://docs.docker.com/reference/compose-file/services/#stop_grace_period)
- [Socket.IO reverse proxy requirements](https://socket.io/docs/v4/reverse-proxy/)
