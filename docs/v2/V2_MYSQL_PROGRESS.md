# MySQL persistence implementation and local acceptance

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
