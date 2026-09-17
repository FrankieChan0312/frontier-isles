# MySQL persistence implementation and local acceptance

The sections below record the original MySQL implementation at `ee6546c`. Its synchronous
bridge is superseded by the **asynchronous persistence follow-up** appended to this file.
Historical passing results are not counted as qualification of the follow-up source.

## Authorized scope and baseline

Starting branch: `feat/v2-online-multiplayer`. Starting HEAD:
`83151ff28329803d923cbaa3c59930d128fc7872`. Worktree was clean. Dedicated branch:
`feat/v2-mysql-persistence`, created from that exact baseline.

The attached MySQL goal is the active task. Earlier Goal C tasks/acceptance reports are
historical context. No hosting accounts, production databases, VPS, cloud resources, image
publication, push, merge, tag or deployment are authorized.

## Plan (completed)

1. Formalize the existing aggregate repository boundary without changing SQLite semantics.
2. Add a direct MySQL driver, strict configuration, explicit schema bootstrap/checking,
   canonical payload storage, transactional quarantine and optimistic storage revisions.
3. Preserve synchronous commit-before-observation with a bounded dedicated worker bridge;
   retain Room/GameSession orchestration, engine, AI, privacy and protocol unchanged.
4. Run shared semantic tests against SQLite and isolated local MySQL; force rollback,
   connection failures, stale writes and restart/replay through the real server process.
5. Update existing runbooks and record the worker latency tradeoff and future RDS boundary.
6. Run repository aggregate checks, recovery/security/load, simulations, browser suites,
   MySQL integration/restart, artifact audit and diff checks; make coherent local commits.

## Evidence

- Preflight: exact branch/HEAD and clean worktree confirmed; Node 24.19.0, npm 11.17.0,
  Docker Desktop engine reachable. No existing containers used.
- `npm run check:all`: exit 0. Frontend 24 files/112 tests; core 35/261; AI 15/36;
  contracts 7/66; server 25/206. Total 106 files/681 tests. Typecheck, lint (zero warnings),
  frontend production build and server build passed. The server suite includes all accepted
  SQLite recovery/restart, security, delivery, lifecycle, load and online-game tests.
- MySQL integration: 3 files/31 tests passed against the digest-pinned real MySQL service.
  Compiled production entry/worker restart, discarded ACK replay, actual connection kill,
  lock timeout, rollback, schema failures, stale write/delete/recreate and binary corruption
  passed. The final source run repeated all 31 successfully. Owned container stopped/removed.
- `npm audit --json`: exit 0, zero vulnerabilities. Only mysql2 3.24.4 was added as a direct
  production dependency; ten lockfile packages including its transitive dependencies were added.
- `npm run e2e -- --trace on`: exit 0, all 39 browser tests passed without retries/skips.
  Online/lobby artifact audit: 31 traces and 10 reports, zero detected credentials, session
  identities, digests, fingerprints or authoritative RNG. Storage-log audit: 23 reports,
  the same zero findings. Runtime/harness assertions also checked actual disposable DB passwords.
- Final `npm run check`: exit 0; typecheck, zero-warning lint, 409 frontend/core/AI tests and
  production build passed on the completed source. Local acceptance is passed; Human architecture
  review and all future deployment qualification remain separate.
- V1 `npm run simulate`: exit 0; 100/100 games, 65,341 commands, deterministic summary hash
  **`1adc49e8`**, unchanged from the accepted baseline.
- `npm run simulate:online`: exit 0; six legal winners, matching repeated-seed results for
  2H+2AI, 3H+1AI and 4H. The accepted online rules, views and delivery harness remain unchanged.
- The server aggregate's load regression completed two cycles, 16 total Rooms, eight active
  games, 24 peak sockets, 1,168 commands, 64 snapshots and 600 publications, with zero retained
  owned resources. This is local regression evidence, not RDS capacity qualification.

## Repair evidence

No accepted tests were skipped or weakened. Initial focused failures exposed strict optional
property/driver argument typing (fixed), MySQL BIGINT system-variable string representation
(compared safely), and MySQL's refusal to prepare transaction-control statements (use driver
transaction API). Two test setup defects were repaired: a rewritten Room identity was invalid
for an active-game aggregate, and ordinary JSON key ordering is not an equality contract.
Use a coherent waiting-Room fixture and canonical equality, respectively. TypeScript pipe
narrowing and the harness cleanup `finally` lint issue were fixed without disabling checks.
Source review also added explicit TLS hostname verification, incarnation guards against
delete/recreate stale ownership, and byte-exact key/checksum corruption rejection, with tests.

The first local commit is `3656243` (`refactor: formalize multiplayer persistence recovery
contract`), after the aggregate regression check passed. No history was rewritten or pushed.

## Final verification record

| Command | Exit | Result |
| --- | --- | --- |
| `npm run check:all` | 0 | All repository typecheck/lint/test/build and server checks; 681 tests / 106 files |
| `npm run test:mysql` | 0 | Final real MySQL adapter/recovery/restart gate; 31 tests / 3 files |
| `npm run simulate` | 0 | 100 legal winners, 65,341 commands, hash `1adc49e8` |
| `npm run simulate:online` | 0 | Six legal winners; repeated-seed summaries match for all three seating modes |
| `npm run e2e -- --trace on` | 0 | 39/39 Chromium browser cases; traces retained/redacted |
| `npm run audit:artifacts` | 0 | 31 online/lobby traces, 10 reports; no matched private credentials/state |
| `npm run audit:artifacts -- server/logs` | 0 | 23 MySQL-related log/report files; no matched private credentials/state |
| `npm audit --json` | 0 | Zero vulnerabilities |
| `npm run lint:server` | 0 | Focused lint; zero warnings |
| `npm run check` | 0 | Final aggregate: typecheck, lint, 409 tests and production build |
| `git diff --check` | 0 | No whitespace errors after final corrections |

`check:all` invokes `check` and `check:server`; these invoke the repository's actual
`typecheck`, `lint`, `test`, `build`, `typecheck:server`, `lint:server`, `test:server` and
`build:server` scripts. Its complete server suite includes the same recovery/security/load
test files as `test:recovery`, `test:security` and `test:load`; those subsets were not rerun
redundantly. The full traced browser run includes the lobby, online and restart subsets.
No unavailable, skipped, interrupted or unrun check is counted as passing.

During development, `npm run typecheck:server` exited 1 for the initial strict typing errors;
early `npm run test:mysql` attempts exited 1 for the issues listed above (including build/test
fixture errors), and `npm run lint:server` exited 1 before the cleanup control flow was fixed.
The temporary diagnostic command `npx tsx server/test/run-mysql-tests.ts` exited 1 while
isolating `ER_UNSUPPORTED_PS`; it emitted only a fixed driver code. These failed runs are not
acceptance evidence. The diagnostic instrumentation was removed. No gate was weakened.

Passing totals are 681 ordinary tests plus 31 MySQL tests (712 across 109 files), 39 browser
tests, 100 V1 simulation games and six repeated-seed online runs. Repeated final verification
is not added to those totals. New coverage is two configuration tests and 31 MySQL executions,
including the 13 reused SQLite recovery contracts; the accepted SQLite tests remain present.

## Local commits, resources and review status

Final branch: `feat/v2-mysql-persistence`. Implementation/test commits, in order:

1. `365624338a972b34042e715a67345ecdf1abdfdb` — formalize persistence/recovery contract.
2. `845b8d4687627320a897b0cdbc47d945d09697c4` — MySQL provider, schema, worker, configuration and adapter tests.
3. `19836de79ecd43f04823583203acc0fbcd279f81` — actual restart/recovery, shared contract and artifact audit.

A final documentation-only commit records this evidence; its full HEAD is supplied in the
completion response. The final worktree is verified clean after that commit.

The final owned container was `frontier-isles-mysql-253b1f0f-02ad-46af-823f-526978d3713d`.
It used loopback, a random port, generated credentials, database `frontier_isles_mysql_test`
and tmpfs (no persistent volume). Image:
`mysql:8.4@sha256:85b9bf2e29cf836ecb8c2a15a935d4ba0c606631dff1dd79531a11983c638f2a`.
Every run's owned container was stopped/removed, including failed runs. Final label-filtered
Docker inventory found no remaining task containers. Only the downloaded image/cache remains;
no unrelated container/volume was stopped or removed. The harness refuses remote Docker
endpoints before creation. No application image was built/published for this goal.

No unresolved implementation defect remains in the exercised local scope. The principal
architecture review item is the synchronous bridge's event-loop blocking under remote latency;
it is explicitly not an RDS latency/capacity/failover guarantee. Positive production TLS and
RDS backups/restore remain future deployment tests, as listed below.

**MYSQL_PERSISTENCE_LOCAL_ACCEPTANCE_PASSED**

**PENDING_HUMAN_ARCHITECTURE_REVIEW**

## MySQL acceptance coverage

The dedicated suite has 31 real-MySQL tests: 15 adapter/fault cases, 13 shared recovery cases,
and three actual Node-process restart cases. Two additional configuration tests run in the
ordinary server suite. The shared tests also continue to run against SQLite.

| Required boundary | Evidence |
| --- | --- |
| Empty startup, create/update/delete, pool close | MySQL adapter CRUD/close case |
| State/RNG/private Human/session recovery, revisions | Shared recovery and actual process restart |
| AI replacement and original Human denial | Shared irreversible replacement recovery |
| Pending decisions | Shared SEVEN, KNIGHT and BUILD_TRADE cases |
| Checksum/malformed/future/oversized records | Transactional quarantine and invalid-write cases |
| Unsupported database version, partial schema | Verify-only/future/missing-table rejection case |
| Retained command results, bounded order, conflicts | Shared result-cache and retry recovery |
| Exact replay after restart or lost ACK | Built-server acknowledged/discarded-ACK process cases |
| Stale expected revisions and concurrent writes | Two-writer, stale-delete and delete/recreate cases |
| Rollback and uncertain commit | Before/after-COMMIT injected failures, actual connection kill |
| Unavailable startup and mutation failure | Dead endpoint and temporarily unavailable table cases |
| Query/lock timeout | Real held-row lock, failed adapter and unchanged durable generation |
| No raw token/private diagnostic leakage | Canonical-record, diagnostic and process-output assertions |
| Clean shutdown | Real signal handler, SHUTDOWN_COMPLETE, worker/pool/process exit |
| TLS and byte integrity | Untrusted-CA refusal, explicit identity verification, corrupted binary keys/checksums |

Failure tests compare private aggregates using canonical equality/booleans and never print
credentials. The process harness uses a real four-Human Room and a legal initial settlement,
preserves MySQL while killing/restarting the server, resumes all original credentials and verifies
exact recovered state/RNG, unchanged replay state and publication revision. The lost-ACK variant
deliberately discards the acknowledgement after observing the committed publication. The shared
tests additionally prove that both accepted and rejected retained outcomes precede observation.

## Architecture decision under review

The accepted repository API and lifecycle callbacks are synchronous. A small worker bridge
lets the MySQL driver perform asynchronous network I/O while the authority waits for a
bounded commit result. This preserves the no-yield mutation/commit/publication boundary
without rewriting orchestration. Database latency consequently blocks the authority event
loop, as local SQLite I/O already does, but potentially for longer over a network. Remote
latency/capacity must be qualified before RDS deployment. No horizontal scaling is added.

## Files and scope

- Repository/dependencies: `package.json`, `package-lock.json`, `server/package.json`,
  `server/tsconfig.json`, `server/vitest.mysql.config.ts`.
- Server composition: `server/src/config.ts`, `server/src/server.ts`.
- Persistence: `server/src/persistence/multiplayer-repository.ts` contract documentation;
  new `mysql-config.ts`, `mysql-schema.ts`, `mysql-store.ts`,
  `mysql-worker-protocol.ts`, `mysql-worker.ts`, `mysql-multiplayer-repository.ts`.
- Tests/harness under `server/test/`: `health.test.ts`, `mysql-config.test.ts`,
  `multiplayer-recovery.test.ts`, `recovery-contract.ts`, `mysql-adapter.mysql.ts`,
  `mysql-recovery.mysql.ts`, `mysql-restart.mysql.ts`, `mysql-test-helpers.ts`,
  `mysql-process-entry.ts`, `production-process-helpers.ts`, `run-mysql-tests.ts`,
  `run-artifact-audit.ts`.
- Environment examples: `.env.example`, `.env.production.example`; placeholder values only.
- Documentation: this progress/acceptance record, `ADR-V2-0014-mysql-aggregate-persistence.md`,
  `V2_PERSISTENCE_RECOVERY.md`, `V2_DEPLOYMENT.md`, `V2_SECURITY.md`,
  `V2_ALPHA_TESTING.md`, `V2_ARCHITECTURE_BASELINE.md`.

There are no changes to SQLite implementation/schema, Room/GameSession orchestration, core,
AI, UI, gateways or wire contracts. No rules, future product features, backend services beyond
the requested adapter, generic harness framework, skills or AGENTS routing changes were added.

## Unverified deployment boundaries

RDS, EC2, Vercel split-origin deployment, GoDaddy DNS, public TLS/WebSocket, production load,
RDS failover/PITR/backup restore and positive RDS certificate-chain qualification remain untested.
The local SQL connection is loopback-only; the TLS rejection/configuration gates do not claim
an RDS TLS deployment test. One authority is supported; database latency blocks its event loop.
The existing application-image `smoke:container` is not rerun in this goal because Docker was
explicitly restricted to the isolated MySQL dependency. Real built-server process restart and
the accepted SQLite regression suites are run instead; no container-image result is claimed.

No AWS, Vercel, GoDaddy, Docker Hub account or VPS was accessed. No real/production database
was accessed or modified. No cloud resource, DNS entry, secret resource, image publication,
push, merge, tag or deployment was performed. Only task-owned local MySQL containers were used.

## Asynchronous persistence follow-up — 2026-09-17

### Baseline and authorized scope

Starting branch `feat/v2-mysql-persistence`; exact starting HEAD
`ee6546c469c5389afd4b7f868764843e02b4709d`; worktree clean. The attached async `/goal`
supersedes the earlier synchronous-bridge architecture. Mandatory repository documents,
this entire historical progress report, persistence adapters, authority queues, transport
publication/ACK paths and relevant ADRs were inspected before implementation.

The active task is [V2_ASYNC_PERSISTENCE](../../tasks/V2_ASYNC_PERSISTENCE.md). Architecture
is recorded in [ADR-V2-0015](ADR-V2-0015-asynchronous-authoritative-persistence.md).
Local commits are authorized. No deployment, push, merge, tag, production/cloud database,
AWS, Vercel, GoDaddy, Docker Hub account or VPS access is authorized or performed.

### Implemented architecture

**Before:** synchronous `load(): readonly MultiplayerRecord[]` and
`save/remove/flush/close(): void`; worker-owned MySQL I/O with `Atomics.wait` in the
authority. Network delay blocked every Room, HTTP and Socket.IO timers.

**After:** `load(): Promise<readonly MultiplayerRecord[]>` and
`save/remove/flush/close(): Promise<void>`. `MysqlMultiplayerRepository.open()` uses
mysql2/promise directly in the Node authority. The worker and worker protocol are deleted.
The two-connection pool has bounded acquisition, query/lock and operation deadlines.
No synchronous network bridge, new package dependency or production sleep remains.

Each Room owns one FIFO shared by lobby, GameSession, AI, replacement and expiry.
The queue remains held while a candidate aggregate, retained result and publication
revision commit. Committed snapshots stay isolated while awaiting I/O; even a newly
constructed game is unavailable until its initial aggregate commits. Publication and
successful command ACK follow commit. Same-Room requests revalidate at dequeue;
unrelated Rooms have independent queues. Bounded reserved FIFO control admission lets
disconnect/expiry proceed even when ordinary client admission is full.

Disconnect latches/cancels pending AI immediately, captures the original grace deadline,
then persists presence through the Room queue. A validated resume immediately invalidates
queued old-transport authority and cancels a held choice before its durable resume waits.
No presence-only mutation consumes core RNG. One pending attachment per socket prevents
duplicate creation while storage is awaited. Lost attachment sockets use normal cleanup.

Startup awaits recovery before admission; shutdown stops admission immediately, cancels
AI choices, drains pending commits/control work, awaits flush and pool closure. Disposal
retains a drain promise for late shutdown. Persistence failure disables authority without
publishing a candidate or acknowledging its success. Unknown COMMIT outcomes require
restart and original-request retry, never a blind new write.

SQLite retains DatabaseSync, exclusive ownership, schema/record format, WAL/FULL,
quarantine, checkpoints and rollback semantics behind the same Promise contract. Existing
tests were migrated to await those operations, including offline browser restart fixtures.
The shared 13-scenario recovery contract retains its assertions for both providers.
Game core, AI strategy, UI/gateway behavior and public realtime contracts are unchanged.

### Additional tests and development evidence

Seven focused async authority cases cover lobby candidate visibility/revision conflicts,
initial-game visibility, disconnect during a pending command and original deadline,
delayed-write rejection, shutdown draining, full client admission/control FIFO, and
closure-versus-replacement admission order. Two real-MySQL cases cover controlled
latency/multi-Room progress and Promise/pool connection cleanup. Existing MySQL fault,
CAS, quarantine, TLS rejection, recovery and process restart/replay tests remain present.

The initial real-MySQL follow-up run passed 32 tests (before the extra pool case). Its
800 ms minimum injected pre-COMMIT hold measured 810 ms; the 20 ms timer fired at 34 ms,
HTTP at 47 ms and Room B's ordered commands at 89 ms, with 23 real Socket.IO pings.
Room A had no pre-commit publication/ACK and one state transition for its exact retry.
These are intermediate measurements; the final gate record below supersedes them.

Development failures were inspected rather than counted as passes: mechanical async
call-site/type/ASI migration errors, an incorrect focused-test working directory, an AI
path calling queued public publication from inside its own queue, and a held-choice
test's continuation assumption. The latter now explicitly restarts AI after resume,
matching transport behavior, while retaining stale-choice/state/RNG assertions. The
full server run then exposed the queued-resume authority race; its focused Socket.IO
and security rerun passed all 15 cases after the immediate epoch/cancellation fix.
Two aggregate attempts stopped at missed async browser fixture calls and a new test's
TypeScript closure narrowing, respectively; neither is passing acceptance evidence.
Final focused authority tests pass 7/7. No assertion was skipped or weakened, and no
architectural contradiction was bypassed.

### Final gate record

All final gates below completed successfully on 2026-09-17 using Node 24.19.0 and
npm 11.17.0. No skipped, interrupted or unrun test is counted as passing.

| Exact command | Exit | Final evidence |
| --- | --- | --- |
| `npm run check:all` | 0 | Frontend 24 files/112 tests; core 35/261; AI 15/36; contracts 7/66; server 26/213: 107 files, 688 tests. Typecheck, zero-warning lint and frontend/server builds passed. |
| `npm run test:mysql` | 0 | 4 files, 33 tests; original 31 plus the two new async cases. Real local MySQL adapter faults/CAS, shared recovery and compiled-process restart/lost-ACK replay passed. |
| `npm run simulate` | 0 | 100/100 legal winners, 65,341 commands; deterministic V1 hash `1adc49e8`. |
| `npm run simulate:online` | 0 | 6 games, 6 legal winners; repeated seeds match for 2/3/4-Human configurations. |
| `npm run e2e -- --trace on` | 0 | All 39 Chromium tests passed, including 31 lobby/online and 8 V1 cases; zero retries/skips. |
| `npm run audit:artifacts` | 0 | 31 traces, 10 reports; zero tokens, session identities, digests, fingerprints or authoritative RNG exposures. |
| `npm run check` | 0 | Final aggregate rerun: typecheck, zero-warning lint, 409 frontend/core/AI tests and production build; completed at 15:18:05 +08:00. |
| `npm run audit:artifacts -- server/logs` | 0 | Final scan including the final check log: 52 reports; all five exposure counters zero. |
| `git diff --check` | 0 | No whitespace errors. |

`check:all` invokes `check` and `check:server`; these execute the required
`npm run typecheck`, `npm run lint`, `npm run test`, `npm run build` and their server
counterparts. The server suite includes the complete SQLite recovery, security/privacy
and load suites. Distinct ordinary/MySQL coverage totals **111 files and 721 tests**;
the repeated final aggregate is not added again. Browser tests and simulation runs are
reported separately. Existing Vite chunk-size advice is described under limitations.

Final controlled pre-COMMIT latency was **807 ms**. A requested 20 ms timer fired at
**31 ms** (11 ms late), lightweight HTTP completed at **42 ms**, and Room B's ordered
accepted/stale commands completed at **84 ms**, while Room A was still awaiting its
transaction. **22 Socket.IO heartbeats** progressed and both clients remained connected.
Assertions enforced a minimum 790 ms hold, timer below 400 ms, HTTP/Room B below 600 ms,
and live heartbeat progress, with deliberately generous local/CI margin.

Room A's ordering was **commit → publication → ACK**, with one commit for its command
and serialized exact retry. Room B independently serialized its second command and
rejected its stale revision. Committed snapshots remained unchanged during the hold.
The rejected-write unit case proved neither publication nor success ACK exposes its
candidate. Pool cleanup observed two MySQL connections before awaited close and zero
after it. Existing restart/recovery assertions retain exact state, RNG, retained results,
publication revisions, conflicting-ID rejection and lost-ACK replay without a second
state/RNG advance. The load gate completed two cycles/16 Rooms/1,168 commands with zero
retained resources. These results qualify local scheduling and correctness only.

Reproducible local evidence is in ignored `server/logs/async-final-*.log`,
`async-final-gates.jsonl`, `mysql-async-latency-summary.json` and
`goal-c-12-load-summary.json`. Historical evidence above is preserved unchanged apart
from its explicit superseded-architecture notice.

### Follow-up file inventory

49 files created, changed or removed relative to the accepted starting HEAD.

Production source:

- `server/src/game/game-execution-queue.ts`
- `server/src/game/game-session.ts`
- `server/src/graceful-shutdown.ts`
- `server/src/lobby/lifecycle-runtime.ts`
- `server/src/lobby/register-lobby-handlers.ts`
- `server/src/lobby/room-service.ts`
- `server/src/persistence/multiplayer-repository.ts`
- `server/src/persistence/mysql-multiplayer-repository.ts`
- `server/src/persistence/mysql-store.ts`
- `server/src/persistence/mysql-worker-protocol.ts` (removed)
- `server/src/persistence/mysql-worker.ts` (removed)
- `server/src/persistence/sqlite-multiplayer-repository.ts`
- `server/src/server.ts`

Tests and existing verification helpers:

- `server/test/alpha-load.test.ts`
- `server/test/async-authority.test.ts`
- `server/test/fake-lifecycle-runtime.ts`
- `server/test/game-network-helpers.ts`
- `server/test/game-presence.integration.test.ts`
- `server/test/game-presence.test.ts`
- `server/test/game-room-start.test.ts`
- `server/test/game-session.test.ts`
- `server/test/lobby.integration.test.ts`
- `server/test/multiplayer-recovery.test.ts`
- `server/test/multiplayer-repository.test.ts`
- `server/test/multiplayer-restart.integration.test.ts`
- `server/test/mysql-adapter.mysql.ts`
- `server/test/mysql-async.mysql.ts`
- `server/test/mysql-recovery.mysql.ts`
- `server/test/mysql-restart.mysql.ts`
- `server/test/persistence-test-helpers.ts`
- `server/test/recovery-contract.ts`
- `server/test/room-lifecycle.test.ts`
- `server/test/room-service.test.ts`
- `server/test/run-artifact-audit.ts`
- `server/test/run-container-smoke.ts`
- `server/test/security-http.test.ts`
- `server/test/security-storage.test.ts`
- `server/test/security-wire.integration.test.ts`
- `tests/e2e/online-restart.spec.ts`
- `tests/e2e/realtime-test-server.ts`

Documentation and task record:

- `docs/v2/ADR-V2-0014-mysql-aggregate-persistence.md`
- `docs/v2/ADR-V2-0015-asynchronous-authoritative-persistence.md`
- `docs/v2/V2_ALPHA_TESTING.md`
- `docs/v2/V2_ARCHITECTURE_BASELINE.md`
- `docs/v2/V2_DEPLOYMENT.md`
- `docs/v2/V2_MYSQL_PROGRESS.md`
- `docs/v2/V2_PERSISTENCE_RECOVERY.md`
- `docs/v2/V2_SECURITY.md`
- `tasks/V2_ASYNC_PERSISTENCE.md`

Dependencies added: **none**. The existing pinned mysql2 dependency is reused.

### Local commits and limits of qualification

1. `0790e895af9d514b6a158ea427576a297d91b07b` — await authoritative persistence per Room;
   direct MySQL, shared Promise API, queue/observation/presence boundaries, existing test migration.
2. `bc53907b0dcc09389ef31f97a39adcccd1c25b1c` — seven async authority tests and two real-MySQL
   latency/connection-cleanup tests.

A final documentation commit records the completed acceptance results; its full HEAD and the
post-commit clean status are provided in the completion response. No history was rewritten.

The final MySQL harness used only its labeled loopback container
`frontier-isles-mysql-c8df616a-b1de-4974-b20c-51a0820c94fa`, generated credentials and tmpfs.
It stopped/removed that container; the subsequent label-filtered inventory found none remaining.
No unrelated container, volume, database or file was reset. Obsolete generated worker output was
removed only from this repository's server build directory; no source worker is emitted again.

There is one Node authority. RDS and real network tail latency/capacity/failover, EC2, Vercel,
public TLS/WebSocket, GoDaddy DNS and production backup/PITR/restore remain unverified. Negative
TLS/configuration tests do not imply positive RDS certificate-chain qualification. The local
delay test proves scheduling and durable ordering, not a production latency SLO. SQLite still
performs synchronous local disk I/O. The existing Vite large-chunk build advisory remains;
frontend source/bundling is unchanged, and lint has zero warnings.

No engine rules, AI strategy, UI, gateway, public protocol, account system, distributed service,
new dependency, unrelated future feature, cloud resource, deployment, push, merge or tag was added.
