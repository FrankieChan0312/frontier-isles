# Frontier Isles V2 Goal C Progress

Branch: `feat/v2-online-multiplayer`

Required and verified starting HEAD: `302a951dad3828467c743a20d454198627d9cb8e`

Task specification: [Goal C](../../tasks/V2_GOAL_C_RECOVERABLE_ONLINE_ALPHA.md)

## Preflight

- Exact branch and starting HEAD verified; initial working tree clean.
- Read root AGENTS.md, V1 scope/rules/architecture, testing/deployment, AI/trading,
  gateway/persistence ADRs, all accepted V1 ADRs, all V2 documents and nine V2 ADRs.
- Inspected GameSession, Room lifecycle, Socket.IO handlers, browser gateways/stores/UI,
  runtime contracts, server/gateway integration tests and browser network observers.
- Goal B baseline `npm run check:all`: exit 0, all 89 files / 529 tests retained:
  frontend 22 / 85, core 35 / 261, AI 15 / 36, contracts 6 / 62, server 11 / 85.
  Typechecks, zero-warning lint and all builds pass. Existing Vite size advisory only.
  `npm run simulate`: exit 0, 100/100 legal winners, 65,341 commands, maximum
  996 commands / 170 turns / 467 RNG draws, unchanged hash `1adc49e8`.
  `npm run simulate:online`: exit 0, 6/6 legal winners; repeated 2H+2AI, 3H+1AI,
  4H summaries match the accepted version 749 / 134 turns / 383 draws and public
  SHA-256 `ead66aa5cb05a2b907c1ea9f7e40078389d9cf34c32e1bf132e40b03123652a3`.
  `npm run e2e:lobby`: exit 0, 6/6 accepted browser journeys (2.7 minutes).
  `npm run e2e:online`: exit 0, 13/13 accepted browser journeys (11.4 minutes;
  slower host execution than the recorded Goal B run, with no relaxed limits).
  `npm run e2e`: exit 0, 27/27 accepted browser journeys (14.9 minutes).
  Complete preflight passed before any production source modification. Local logs are under
  ignored `logs/goal-c-baseline-*.log`.
- Verification uses a temporary Windows execution request to avoid the documented
  standby interruption; no persistent power setting is changed.
- The Goal C request explicitly supersedes ADR-V2-0007's different-payload replay
  behavior and the earlier conditional active-disconnect pause sketch. New ADRs will
  preserve the historical records and specify those changes.

## V2-09 — Delivery, idempotency, concurrency and resynchronization

Status: COMPLETE

Full task gate passed. Commit: `37362a6517ccf359b207eda55f4114f0f356fa2f`
(`fix: harden multiplayer command delivery and concurrency`). Working tree verified clean after commit.

- Per-GameSession FIFO serializes Human execution, result recording, publication and AI.
  Dequeue rechecks current transport and session authority. Queue capacity defaults to 64.
- Canonical SHA-256 fingerprints bind complete requests to each session's insertion-order
  cache (128 results by default). Exact replays retain their original outcome without new
  effects; conflicts return `COMMAND_ID_CONFLICT`; overload returns `GAME_BUSY`.
- The browser admits eight commands, submits one at a time, and defaults to an eight-second
  acknowledgement deadline with two identical retries and 250/500 ms backoff (one-second cap).
  Reattachment waits and malformed-snapshot repair are bounded. Permanent session changes
  cancel work; the winning result can settle while later queued mutations are cancelled.
- Authoritative resync covers stale/uncertain outcomes, reconnect, invalid snapshots,
  mismatched identity and gaps. Older responses cannot replace newer views. Exhausted retries
  never infer success from a view change. Accessible delivery state keeps manual resync usable.
- No dependencies, core rules, RNG, V1 saves or local-authority changes.

Files created: server execution queue, canonical fingerprint helper, focused delivery unit and
Socket.IO integration tests; browser delivery settings/cancellation helper; browser delivery E2E;
ADR-V2-0010; this progress report; repository copy of the authorized Goal C specification.
Files changed: GameSession/Room command boundary and socket handlers; strict realtime game/error
contracts and tests; SocketGameGateway and its tests, Lobby gateway composition, projection store,
App/GamePage status; network fixtures and all-command workflow replay assertions; package browser
script; README, testing, architecture and known-limitations documentation.

Focused verification (all final reruns exit 0):

- `npm run typecheck`, `npm run lint`: pass.
- Server delivery/session/integration/workflow Vitest selection: 4 files / 38 tests pass.
- Additional real Socket.IO delivery/concurrency selection: 1 file / 6 tests pass.
- Browser gateway Vitest selection: 1 file / 13 tests pass.
- Playwright `tests/e2e/online-delivery.spec.ts`: 2/2 pass (49.4 seconds).
- `npm run check:game`: pass, core 35 files / 261 tests, AI 15 files / 36 tests.
- Full `npm run check:all`: exit 0, 91 files / 552 tests: frontend 22 / 94,
  core 35 / 261, AI 15 / 36, contracts 6 / 63, server 13 / 98. Includes root
  typecheck/lint/test/build/check and server typecheck/lint/test/build/check; zero lint
  warnings and the existing Vite chunk-size advisory only.
- `npm run simulate`: exit 0, 100/100 legal winners, 65,341 commands, hash `1adc49e8`.
  The entire report and all 100 summaries exactly match the preflight baseline.
- `npm run simulate:online`: exit 0, 6/6 legal winners, repeated summaries match across
  2H+2AI, 3H+1AI and 4H. Complete JSON summaries exactly match the Goal B baseline:
  version 749, 134 turns, 383 RNG draws, EAST winner and the accepted public trace hash.
- `npm run e2e:lobby`: exit 0, all 6 accepted journeys pass (54.2 seconds).
- `npm run e2e:online`: exit 0, 15/15 journeys pass (3.0 minutes), retaining all 13
  accepted Goal B journeys and adding two actual-browser delivery fault cases.
- `npm run e2e`: exit 0, 29/29 journeys pass (4.4 minutes), including all 8 V1 and
  all 6 Goal A journeys. `git diff --check`: exit 0. Logs: `logs/goal-c-09-gate-*.log`.

Development failures were corrected before the full gate: a new discard expectation used the
wrong fixture's initial resource count; the new victory test used the wrong legal-action field;
two caught-error rethrows needed their causes preserved; an AI test incorrectly assumed an AI
could not pause for a Human trade response; and a new deferred helper used a Promise API outside
the configured TypeScript library target. Production limits and accepted assertions were not
relaxed. All full-gate commands subsequently passed; no test is skipped or ignored.

Review so far: all twenty command types replay after AI through actual sockets; current/non-current,
same-session, competing trade responders and two-Room contention are covered; held AI cannot allow
a replaced socket's queued command to acquire authority. Pending trade, discard and robber choices
survive resume before a saved request executes once. Retry settings, queue/cache counts, waits and
acknowledgement callbacks are bounded. Public delivery contracts reject private payloads and cache
metadata. Known boundaries: no durable browser outbox; cache retention is bounded; exhausted
delivery can remain uncertain. Active pause/replacement, durability and production hardening
remain later task work. No unrelated or future product feature was implemented in this task.

## V2-10 — Active-game presence and AI replacement

Status: COMPLETE

Full task gate passed. Commit: `9342a067aa009f5914a20613c3b2e45621e251f5`
(`feat: add active-game reconnect and AI replacement policy`). Working tree verified clean after commit.

Implemented immediate pause on any Human disconnect, retaining the 30-second grace. New Human
commands are refused while paused; exact retained results remain readable. AI checks presence
after awaiting a choice and discards a choice that crossed a presence change. Core state and RNG
remain unchanged through disconnect/reconnect. Multiple Humans must all recover or be replaced.

Expired credentials lose authority. Only the current connected Host can select Builder, Merchant
or Sentinel to take over an expired Human's same PlayerId permanently. The GameSession controller
overlay leaves the original core player/state intact and gives AI only the redacted player view.
An expired Host transfers in canonical seat order; if another eligible Human is still within
grace, that Human may resume before transfer. No eligible Human sessions closes the Room.

The Host can close a replacement-required game. `GAME_ABANDONED_TTL_MS` defaults to 30 minutes
from the first unresolved expiry or game completion; snapshot reads do not extend it. Resolving
replacement cancels the deadline. Closure/disposal cancels timers and stops AI; late socket
callbacks cannot rebuild closed Room presence or retain session membership.

Strict Room/Game presence projections expose only public seat/deadline/profile metadata. The UI
shows pause/countdown, server-confirmed expiry, Host-only replacement/profile/closure controls,
non-Host waiting and accessible active-state announcements. Browser countdown zero never grants
authority. All three required viewport screenshots were visually reviewed and have no overflow.

Files created: strict shared presence schema/tests; server presence unit and actual-socket
integration tests; GamePresencePanel and UI tests; online presence browser suite; ADR-V2-0011.
Files changed: Room/GameSession lifecycle, config/composition/handlers and environment example;
realtime request/acknowledgement/event/Room/Game schemas and inventories; Lobby/Game gateways,
projection store, App/GamePage, gateway tests and test lifecycle/network/browser helpers;
online browser script, README, architecture, testing, limitations and this report.

No dependencies added. No core, AI-package, local gateway, rules, deterministic entropy or V1
save implementation changed. Durability and production hardening remain the following tasks;
there is no unrelated future feature in this task.

Focused final verification: root/server typechecks and zero-warning lint exit 0; presence and
related server selection originally 45/45 passes; final actual-socket selection 2/2 passes;
contracts 7 files / 66 tests pass; gateway/UI 2 files / 20 tests pass; Playwright delivery/presence
6/6 pass (2.4 minutes). Full regression gate passed. Development test failures were corrected:
an event inventory needed the two new intents, a discard assertion used `count` instead of the
existing `quantity`, and gateway teardown exposed the fixed late-disconnect disposal bug. No
accepted assertion, grace interval or production limit was weakened.

Full gate results (all exit 0):

- `npm run check:all`: 95 files / 582 tests; frontend 23 / 101, core 35 / 261,
  AI 15 / 36, contracts 7 / 66, server 15 / 118. Root/server typechecks, zero-warning
  lint and all builds pass; only the existing Vite chunk-size advisory remains.
- `npm run simulate`: 100/100 legal winners, 65,341 commands, hash `1adc49e8`.
  Complete JSON report and every summary exactly match the accepted baseline.
- `npm run simulate:online`: 6/6 legal winners across repeated 2H+2AI, 3H+1AI and
  4H. Complete JSON summaries exactly match baseline, including version 749, 134 turns,
  383 RNG draws and public hash `ead66aa5cb05a2b907c1ea9f7e40078389d9cf34c32e1bf132e40b03123652a3`.
- `npm run e2e:lobby`: all 6 accepted journeys pass (1.3 minutes).
- `npm run e2e:online`: 19/19 pass (5.4 minutes), retaining all 13 Goal B journeys
  and both V2-09 fault journeys, plus the four new presence journeys.
- `npm run e2e`: 33/33 pass (6.3 minutes), including all 8 Single Player and all 6
  Goal A regressions. No test skipped, ignored or weakened.
- `git diff --check`: exit 0. Logs: `logs/goal-c-10-gate-*.log`.

## V2-11 — Durable Room/Game recovery

Status: COMPLETE

Full task gate passed. Commit subject: `feat: add recoverable multiplayer room persistence`.

Implemented one SQLite aggregate repository using the installed Node 24.19.0 / SQLite 3.53.3
runtime. MultiplayerRepository has in-memory and exactly one durable adapter. Transactions use
WAL/FULL durability and exclusive local ownership; no lock spans an awaited AI choice. Each record
contains Room revision/Host/seats, valid session identities and token digests, and optional exact
GameState/RNG, original mapping, replacement overlay, AI bookkeeping and bounded cached results.

Persistence version 1 has strict private schemas, game/aggregate invariants, canonical JSON,
SHA-256 checksums and a 2 MiB record bound. Invalid writes leave the accepted generation intact.
Corrupt/future/checksum-invalid or colliding-session records are quarantined; unrelated valid
Rooms recover. Unreadable, unrelated, unsupported or structurally inconsistent SQLite databases
fail safely and are not initialized over. Operator diagnostics contain codes/counts, not tokens,
identities, game state, filesystem paths or raw exceptions.

Human state and its command result commit together before success or publication. Room/session
changes commit before response exposure; read-only lookups avoid persistence serialization. AI transitions commit before
publication. Finished retention is included in the winning commit, closing the crash window
between a victory acknowledgement and later cleanup metadata. Any failed write stops authority
and publishes no uncommitted state. The original durable result can be recovered and retried.

Startup restores exact Room revision, core state/RNG, private resources/cards/decisions, original
session/seat/controller mappings and command cache order/capacity. Previously connected Humans
receive a 120-second restart window; previously disconnected deadlines remain unchanged and
expired credentials are never revived. Active games pause, new public presence advances its
publication revision, and AI waits for all required Humans. Graceful shutdown stops admission,
interrupts the current AI choice, drains queued operations, flushes, and closes transports/storage
without deleting recoverable games. Explicit/expired closure deletes records transactionally.

Files created: private canonical JSON/state/aggregate schemas, repository contract/in-memory and
SQLite adapters; repository/recovery/production-process integration tests and test-only crash
writer/process/temporary-store helpers; ADR-V2-0012 and persistence/recovery runbook.
Files changed: GameSession persistence/restore/stop boundary, bounded current-view reuse and
execution queue drain; Room
service repository/recovery/commit/failure boundaries; server configuration, composition, main
and graceful shutdown; health config tests; public value-schema exports for reuse; root/server
package and lockfile, environment/ignore files, server test scheduling, README, architecture,
testing, limitations/report.

Dependency change: declare the existing `zod@4.5.4` as a direct server dependency for private
runtime schemas; no additional dependency version or native SQLite package was introduced.
Node support is now `>=24.19.0 <25` for the inspected built-in SQLite API. Lockfile-only install
reports zero vulnerabilities. No game-core, game-ai, V1 save or LocalGameGateway source changed.

Focused verification: server typecheck and zero-warning lint pass; initial compatible Room/game/
presence selection 4 files / 40 tests passes; expanded persistence/delivery/presence/health
selection 6 files / 51 tests passes; final recovery/database/config selection 4 files / 50 tests
passes. Final `npm run test:recovery`: 3 files / 26 tests pass. It covers real forced process restart,
exact state/RNG and recent-result replay, private pending decisions followed by legal commands,
AI replacement and expired authority, failed-COMMIT no-ack/no-publication, killed-writer rollback,
corruption/quarantine, structural database refusal, closure/expiry and interrupted AI shutdown.

Full gate is running. Initial new-test type errors (missing helper brace, union narrowing and
unparsed acknowledgement types) were fixed. The first full gate found a constructor parameter
property rejected by the root's erasable-syntax setting; it now uses an explicit field, and the
gate restarted. Its server run then found an exact public error-message regression and a
four-Human setup timeout. Restored the accepted safe error text and removed private-record
serialization from read-only Room lookups; both suites pass their focused rerun (20/20).
No accepted tests, production limits or timeouts were relaxed. Security and
deployment qualification remain V2-12; no unrelated future product feature was implemented.

The next full run still exceeded the four-Human setup's five-second bound under suite concurrency.
Combined the redundant Human transition and publication commits into one atomic state/result/
publication-revision transaction, with no intervening asynchronous work. Added an actual SQLite
test proving exactly one save and that all observers see the already committed version/cache.
The standalone command boundary still commits directly; rejected cache entries still commit.
The expanded 18-file server suite still showed setup deadline failures only under unrestricted
worker competition. A four-worker trial still competed for CPU; the runner now caps workers at
two, including the new process/SQLite suites. The unchanged full setup test passes alone in
1,582 ms (all 17 workflow tests pass), compared with its 5,000 ms deadline under worker load.
Every test, in-test concurrent submission, assertion and deadline remains unchanged. This defines
a repeatable test resource budget instead of oversubscribing the host with real-server workers.
Repeated snapshot requests also recomputed the same expensive legal-action projection. GameSession
now retains at most four redacted projections for its current immutable state, clears them on
every accepted transition/closure, and returns detached copies with the current ownership overlay.
A regression test proves no caller mutation can poison later views and a transition invalidates
every viewer. The cache remains server-local; each output is that player's redacted view.

The corrected aggregate gate now passes (all exit 0): `test:recovery` 3 files / 26 tests;
`check:all` 98 files / 615 tests — frontend 23 / 101, core 35 / 261, AI 15 / 36,
contracts 7 / 66, server 18 / 151. The server suite completed in 287.28 seconds with
all accepted workflows and new recovery tests passing. Typechecks, zero-warning lint and builds
pass. Standalone package checks, simulations and browser qualification also pass:

- `npm run check:game`: exit 0, core 35 files / 261 tests and AI 15 files / 36 tests;
  both package typechecks, zero-warning lint and builds pass.
- `npm run simulate`: exit 0, 100/100 legal winners, 65,341 commands, maximum
  996 commands / 170 turns / 467 RNG draws, hash `1adc49e8`. Complete JSON report
  exactly equals the accepted baseline, not only its aggregate hash.
- `npm run simulate:online`: exit 0, 6/6 legal winners across repeated 2H+2AI,
  3H+1AI and 4H. Complete JSON equals baseline: version 749, 134 turns, 383 draws,
  public hash `ead66aa5cb05a2b907c1ea9f7e40078389d9cf34c32e1bf132e40b03123652a3`.
- `npm run e2e:lobby`: exit 0, 6/6 accepted journeys (1.3 minutes).
- `npm run e2e:online`: exit 0, 19/19 journeys (4.9 minutes), including all Goal B
  flows plus delivery, pause, recovery, Host transfer and replacement.
- `npm run e2e`: exit 0, 33/33 journeys (6.0 minutes), including all eight Single
  Player regressions. No skipped or weakened tests.
- Complete simulation comparisons and `git diff --check`: exit 0.

Only the pre-existing Vite chunk-size advisory and Node color-environment notice remain.
Production security, load qualification and container/deployment preparation remain V2-12.
No unrelated future product feature was implemented, and nothing was pushed or deployed.
Logs: `logs/goal-c-11-gate-5-*.log`; command exit statuses are preserved in its results log.

## V2-12 — Security, deployment and alpha qualification

Status: NOT_STARTED

## Scope

Exactly four normal task commits are authorized, in the requested order. Nothing will
be pushed, merged, tagged, published or deployed. No post-V2-12 feature is in scope.
