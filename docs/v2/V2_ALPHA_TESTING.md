# V2 Alpha Qualification

Run all commands from the repository root with the pinned Node 24 family and lockfile. CPU-heavy
verification runs serially. Server Vitest uses two workers because real-server/restart suites also
spawn processes; focused concurrency scenarios retain their actual simultaneous requests and
unchanged acknowledgement deadlines. No accepted test is skipped or weakened.

```sh
npm ci
npm run typecheck
npm run lint
npm run test
npm run build
npm run check
npm run check:server
npm run check:all
npm run check:game
npm run simulate
npm run simulate:online
npm run test:recovery
npm run test:security
npm run test:load
npm run e2e:lobby
npm run e2e:online
npm run e2e
npm run smoke:container
npm audit
git diff --check
```

`build` precedes E2E: the new restart journeys serve the actual production frontend from `dist`.
Playwright's ordinary test server retains test-only deterministic fixtures; restart journeys instead
launch the real production entry point on an ephemeral loopback port, stop it, install an invariant-
valid fixture into its private temporary database offline, then restart it. No production request
can select fixtures. Browser actions create pending discard, robber and trade decisions; another
real process kill/restart preserves exact state/RNG and each owner's view and allows a legal followup.
Corrupt unrelated records are isolated by that same production startup path.

`online-seating.spec.ts` adds real independent Chromium contexts for 3H+1AI and 4H, Ready/Start,
all sixteen setup placements, public synchronization, a normal turn, owner-private hands and
1440×900/1024×768/480×800 layouts. The shared setup helper now accepts the legal sixteenth action
when all four players are Human; its old loop-end error incorrectly rejected that successful case.
Existing 2H+2AI workflows, all twenty commands, lost acknowledgements, duplicate/conflicting reuse,
resync, presence, replacement and Single Player suites remain intact.

Security suites cover environment, exact Origin on real polling/WebSocket traffic, HTTP body/path/
asset/header/readiness boundaries, malformed/deep/prototype payloads, missing acknowledgements,
unexpected handler errors, transport/session/global rates, Room caps and oversized recovery records.
Attachment tests hold an old adapter join across a newer resume and inject a synchronous adapter
throw, checking that only the newest attached transport retains authority.

The bounded load test runs two complete allocation/cleanup cycles, each with four waiting Rooms,
four active games and 24 sockets. It interleaves setup commands across independent games, fills and
evicts per-Human command caches, requests snapshots and resumes eight connections in total. It
reports commands/publications/sockets/duration/RSS/heap and checks all owned timers, callbacks,
queues, cache/view/listener counts, TCP/Engine.IO sockets and limiter maps return to zero. Counts
are Node-only diagnostics, never public routes. The report is `server/logs/goal-c-12-load-summary.json`.
This does not measure production capacity or remote network quality.

Memory is sampled before the load and after each cycle. Reported RSS/heap maxima are the largest
of those observations, not continuously sampled process high-water marks or leak proofs by themselves;
the explicit owned-resource counts provide the cleanup assertions.

The container smoke uses only a unique local container and workspace temporary data, builds by
image ID, verifies private/public artifact boundaries, non-root/read-only execution, exact crash
recovery/replay and graceful stop. It leaves no running smoke container and does not publish the
image. See the deployment runbook for operator commands and remaining Human UAT.

All logs, traces, screenshots and temporary persistence stores are ignored and outside the public
artifact. Native opener tab duplication replaces raw credential export/import in Playwright
arguments. Assertions that compare secrets/private aggregate state report booleans rather than
printing values. Actual retained traces/reports require the final private-data audit documented in
the acceptance report before any sharing. No raw database or trace is a user-facing game asset.

Run `npm run e2e:audit` to retain traces deliberately and `npm run audit:artifacts` to verify them.
The configured reporter redacts bearer token/session identities from trace text/network resources,
preserving original test statuses, steps, screenshots and failures. Its bounded ZIP round-trip and
redaction tests check escaped/plain values, binary preservation and checksum corruption. The
independent artifact scanner rejects remaining identities, digests, fingerprints and authoritative
RNG. `npm run redact:artifacts` also protects already-retained local traces. No test assertion,
failure status or gameplay packet is changed by redaction.

## MySQL persistence qualification

`npm run test:mysql` builds the server and starts its own digest-pinned MySQL service on an
ephemeral loopback port. It runs `vitest.mysql.config.ts`, separately from the database-free default
suite. Missing Docker or failed setup makes this gate fail; MySQL tests are never silently skipped.
The 13 recovery contract scenarios run unchanged against SQLite and MySQL. MySQL-specific tests
cover schema/record corruption, bounds, rollback/uncertain commit, stale writers/deletes and
delete/recreate ownership. Real Node server processes create/start a Room through Socket.IO,
commit a command, die, recover and replay without advancing twice, including discarded ACKs.
The test-only IPC signal bridge invokes the real graceful-shutdown handler on Windows; it is
absent from production source/images. No runtime fixture or control endpoint is introduced.

Local test data exists only inside the harness-owned MySQL container's tmpfs. Cleanup verifies
the generated ownership label and removes only that container. Generated credentials never enter
command arguments or reports. Output uses existing artifact redaction; a detected credential
leak or cleanup failure fails the gate. Record exact results in [MySQL progress](V2_MYSQL_PROGRESS.md).
Run `npm run audit:artifacts -- server/logs` to audit MySQL logs as well as the ordinary browser
artifact audit. Existing SQLite tests and their historical acceptance evidence remain intact.
