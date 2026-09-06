# Frontier Isles V2 Goal B Progress

Branch: `feat/v2-online-multiplayer`
Required and verified baseline: `1376451dba5da61b40fb0cb5220c20bdc5826d4b`
Task specification: [Goal B](../../tasks/V2_GOAL_B_SERVER_AUTHORITATIVE_GAME.md)

## Preflight

- Verified exact branch/HEAD and initially clean working tree.
- Read repository instructions, V1 rules/architecture/domain documents and accepted ADRs,
  all four required V2 documents, Goal A ADRs, and inspected the accepted engine, AI,
  projections, gateway/UI, Room/session transport, simulation and test boundaries.
- Baseline `npm run check:all`: exit 1, 65 files / 346 tests passed; three fork workers
  failed to start. No test assertion failed. Unchanged retry passed: root 68 files / 365 tests; contracts 5 / 38; server 5 / 43; all source builds passed.
- Focused thread-worker diagnosis: 1 file / 2 tests passed.
- Baseline simulation: PASS, 100/100 winners, 65,341 commands, hash `1adc49e8`. Lobby E2E: 6/6 PASS. Full E2E: 14/14 PASS, including all eight accepted V1 journeys.

## V2-05 — Extract reusable game packages

Status: COMPLETE

Plan: move `src/game` and `src/ai` into independent pure TypeScript workspaces, including
their tests and portable simulations. Use package subpath exports, update every consumer,
retain one implementation without compatibility copies, add independent Node test/build/lint
boundaries and dependency-direction tests. Preserve all rules and deterministic fixtures.

Implemented:

- Moved 115 core files and 29 AI files, including every accepted test and portable simulation.
  The core move was byte-equivalent after line-ending normalization; AI changes were imports only.
- Updated frontend, LocalGameGateway, persistence, and E2E fixture imports to compiled package
  subpath exports. No compatibility copies remain.
- Added strict package builds without DOM libraries, independent package scripts and Node tests.
  The retained Vite glob source audit uses a narrow test-only type declaration and now covers
  frontend plus both extracted packages. Package tests use worker threads.
- Added four architecture assertions covering one implementation, core/AI dependency direction,
  browser/entropy exclusions, runtime exports and JSON/detached redacted views.
- Updated root scripts, lockfile, ESLint boundaries, README, architecture/testing documents,
  and ADR-V2-0006. Saved the full user task under `tasks/` for later task gates.

Dependencies: local game-core/game-ai workspaces only. Lockfile audit confirms zero changed
external package versions. `npm ci`: exit 0, 328 installed / 333 audited, zero vulnerabilities.
The installed npm prints an existing esbuild install-script approval notice; no dependency
permission was changed, and source package builds succeed.

Focused verification: core 35 files / 257 tests PASS; AI 15 files / 36 tests PASS;
frontend 19 files / 76 tests PASS (369 total, retaining all 365 accepted tests).
Package builds, root typecheck and zero-warning lint PASS. The final task gate is recorded below.

Resolved verification findings:

- Initial package build exited 1 because the retained source-audit test needed ImportMeta.glob
  typing; the broad Vite client typing also exited 1 because it required DOM types. A narrow
  test-only ImportGlobFunction augmentation fixed both without changing production compiler libs.
- `git diff --check` found two extra EOF blank lines; removed them and reran successfully.
- Root `npm run test`: exit 0, 69 files / 369 tests across the three suites.
- Root `npm run build`: exit 0, production bundle built; accepted size advisory remains.
- The first aggregate `check` exited 1: three mixed AI smoke batches exceeded their existing
  180-second limits while using three workers (all other 33 AI tests passed). Two prior runs
  had passed. Changed only AI test scheduling to one worker to avoid competing simulation heaps;
  all seeds, assertions and timeout bounds remain unchanged. Serial verification passed all
  15 files / 36 tests in 276.48 seconds. An isolated single-fork comparison also passed (one
  four-game smoke test, 23.24 seconds); retained the verified single-thread-worker configuration.
  The failed aggregate and remaining gates passed on rerun as recorded below.
- Aggregate reruns `check`, `check:server`, and `check:all`: exit 0. Contracts remain 5 files /
  38 tests and server remains 5 files / 43 tests. The extracted release corpus passed 100/100
  winners, 65,341 commands, maximum 996 commands / 170 turns / 467 random draws, hash `1adc49e8`.
- First extracted Lobby browser run: 5/6 passed; refresh returned an expired-session message
  during a roughly one-minute test. Screenshot showed the safe Home error. The unchanged
  focused refresh rerun passed in 4.4 seconds; the full browser reruns also passed. No grace,
  timeout, accepted assertion, or Lobby behavior was changed to hide this failure.

Final V2-05 gate:

| Command | Result |
| --- | --- |
| Package core and AI `build`, `typecheck`, `lint`, `test` | All exit 0; core 35 files / 257 tests, AI 15 files / 36 tests |
| `npm run typecheck` | Exit 0 |
| `npm run lint` | Exit 0; zero warnings |
| `npm run test` | Exit 0; frontend 19 / 76 + core 35 / 257 + AI 15 / 36 = 69 files / 369 tests |
| `npm run build` | Exit 0; static build produced, existing size advisory only |
| `npm run check` | Exit 0 after the documented test-worker fix |
| `npm run check:server` | Exit 0; contracts 5 / 38, server 5 / 43, builds passed |
| `npm run check:all` | Exit 0; all frontend, package, contract and server checks passed |
| `npm run simulate` | Exit 0; 100/100 winners, 65,341 commands, hash `1adc49e8` |
| `npm run e2e:lobby` | Exit 0; 6/6 passed on full rerun |
| `npm run e2e` | Exit 0; 14/14 passed, all eight accepted V1 journeys retained |
| `git diff --check` | Exit 0 |

Browser checks retain all required viewport, overflow, console/React, privacy, refresh and
duplicate-tab assertions. No test was removed, skipped or weakened. No core rule or AI algorithm
changed, and no V2-06+ behavior was implemented in this task. Remaining limitations are the
accepted in-memory Lobby and unavailable online game until the next task. Task commit subject:
`456ddfa refactor: extract shared game core and AI packages`; working tree confirmed clean.

## V2-06 — Server-authoritative multiplayer game sessions

Status: COMPLETE

Implemented the shared online creation policy, recursive command/view/event wire schemas,
server GameSession and cryptographic seed boundary, synchronous Host start, fixed active seats,
session-derived command authority, bounded per-session outcome cache, per-Human publication,
deterministic bounded AI, and current-view active resume through the existing socket registry.
Added ADR-V2-0007 and architecture/testing/limitations updates. Dependencies added are local
game-core for contracts, and local core/AI for server; no external versions changed.

Focused results: contracts 6 files / 62 tests, server 8 files / 62 tests;
root typecheck and lint exit 0. Four online-creation tests were
added to core. Accepted tests remain; only the now-obsolete unavailable-start assertions and
event inventory expectations changed to their required Goal B behaviors.

Resolved findings: inspection of the frozen topology IDs caught the edge separator `|` missing
from the new network ID validator; added it to preserve frozen topology IDs. Integration test
typechecking required parsing Socket.IO emitWithAck results at the test boundary. A natural
setup test assumed a Human roll immediately after an AI-first seed; the engine correctly
paused on an AI-to-Human trade. Its dedicated roll journey now uses a documented fixed
NORTH-first seed; separate tests retain AI-first advancement and private-response pause coverage.
Focused reruns pass. Transport source review also found that volatile updates could be dropped
while another packet flushes. Per-socket normal emission with a bounded receipt now preserves
queueing while excluding private packets from Socket.IO's pre-attachment recovery replay.
Receipt callbacks do not drive execution or add a retry policy. Delivery-before-resync, replay
buffer exclusion, reconnected-old-tab rejection and safe internal-error assertions pass.
`check:all` passes: frontend 19 / 76, core 35 / 261, AI 15 / 36, contracts 6 / 62, server 8 / 62.
The 100-game simulation passed with 65,341 commands, maximum 996 commands / 170 turns /
467 RNG draws, and unchanged hash `1adc49e8`. Accepted browser journeys passed: Lobby 6/6,
full suite 14/14, including all eight V1 journeys and viewport/console/overflow/privacy assertions.
No V2-07 browser feature exists yet.

The accepted Lobby requires explicit Host AI assignment for every remaining empty seat.
Start rejects empty seats using the existing authoritative readiness projection.
The explicit online creation boundary preserves V1 creation and save restrictions.

Files created/changed: core creation/invariant modules and creation tests; realtime game value,
command, view, event and envelope schemas plus additive inventories/Room lifecycle and tests;
server GameSession/entropy, Room service and shared socket handlers; Node game fixture/network
helpers and three new game test suites; package manifests/lockfile; architecture, testing,
limitations, ADR-V2-0007 and this progress report. No frontend source or AI algorithm changed.

Tests added: four core online-creation/RNG regressions, 24 contract cases, and 19 server cases
covering start/authority/privacy/AI/recovery and real Socket.IO execution. Existing counts retained.

| Command | Result |
| --- | --- |
| `npm install --package-lock-only --ignore-scripts` | Exit 0; 333 audited, zero vulnerabilities; only three local workspace dependency entries added |
| `npm run check:core` | Exit 0; build/typecheck/lint/test, 35 files / 261 tests |
| Focused contracts `build`, `test` and server `typecheck`, `test`, root `lint:server` | Exit 0 on final source; 6 / 62 contracts, 8 / 62 server |
| `npm run typecheck` | Exit 0 |
| `npm run lint` | Exit 0; zero warnings |
| `npm run test` | Exit 0; frontend 19 / 76, core 35 / 261, AI 15 / 36 = 69 files / 373 tests |
| `npm run build` | Exit 0; static bundle built, existing chunk-size advisory only |
| `npm run check` | Exit 0 |
| `npm run check:server` | Exit 0 |
| `npm run check:all` | Exit 0; all 83 files / 497 tests and builds passed on latest source |
| `npm run simulate` | Exit 0; 100/100 legal winners, 65,341 commands, hash `1adc49e8` |
| `npm run e2e:lobby` | Exit 0; 6/6 accepted Lobby journeys passed |
| `npm run e2e` | Exit 0; 14/14 passed, including all eight V1 journeys |
| `git diff --check` | Exit 0; repeated after final report update |

Intentional limitations: process-local state, fixed started seats, resume only within grace,
no client retry/delivery guarantees, no extended disconnect/replacement or persistence policy.
The browser integration and complete mixed-seat game qualification remain V2-07 and V2-08.
No unrelated future feature or V2-09+ work is included.

All V2-06 gates passed. Committed as `0b78c26 feat: add server-authoritative multiplayer game sessions`;
working tree confirmed clean. Continued automatically to V2-07.

## V2-07 — SocketGameGateway and online UI

Status: COMPLETE

Plan: compose SocketGameGateway with the existing Lobby socket/session; preserve GameGateway
submission and V1 persistence. Use a cryptographic per-gateway namespace around existing
envelope command IDs so retries of the same envelope retain identity. Add strict viewer checks,
version/revision ordering, snapshot resync, safe connection/submission states and clean disposal.
Enable authoritative Host start, render all Human views through the existing GamePage, and
verify real multi-browser setup/turns, active refresh/replacement, privacy and all target widths.

Implemented the composed socket gateway, per-instance cryptographic command namespace, actor
omission, strict viewer validation, version/revision ordering, snapshot recovery and safe busy
states. Separate local/online projection stores preserve offline save/AI behavior; event history
clears on identity changes. Host Start enters the shared GamePage for both Humans. Online headers,
resync, waiting states and controls work with existing board/panels/dialogs. Corrected inherited
single-Human labels and restricted robber-target controls to the acting viewer. Returning Home
after victory detaches the browser credential without changing fixed server seats.

Created ADR-V2-0008 and updated architecture, testing and limitations. Added no dependencies.
The test-only Node server composition injects a fixed seed without a production fixture API.
Focused checks pass (5 files / 15 tests); new Playwright journeys pass 2/2, including real stale
rejection/resync, shared setup/normal turns, all viewports, private hands, refresh and replacement.
Typecheck caught a missing turnNumber in the new store test's event fixture; corrected the fixture.
Earlier gateway typing and caught-error lint findings were corrected before the aggregate gates.
All task gates passed; no test is skipped, removed or weakened.

Files created: `socket-game-gateway.ts` and its real-server tests; game projection store and
PlayerPanels tests; online browser observers/journeys and the test-only realtime server entry;
ADR-V2-0008. Files updated: application mode composition; GameGateway/LobbyGateway and socket
Lobby composition; projection store; Lobby/Game pages, player cards and decision dialogs/tests;
Playwright scripts/config and the obsolete ineligible Start selector; README, both architecture
documents, testing, limitations and this report. No core, AI, server production or contract source
changed. Dependencies added: none; the test entry uses the existing workspace tsx runtime.

Tests added: four real-server SocketGameGateway cases, two authoritative Host/non-Host Start
cases, acting-viewer robber dialog, Human player labels, projection/event identity isolation;
two multi-browser online journeys. The accepted V1 and Goal A assertions remain in place.

| Command | Result |
| --- | --- |
| Focused gateway/store/UI tests | Exit 0; 5 files / 15 tests |
| `npm run typecheck` | Exit 0 after correcting the test event fixture |
| `npm run lint` | Exit 0; zero warnings |
| `npm run test` | Exit 0; frontend 22 / 85, core 35 / 261, AI 15 / 36 = 72 files / 382 tests |
| `npm run build` | Exit 0; 810.88 kB entry chunk, existing size advisory documented |
| `npm run check` | Exit 0 |
| `npm run check:server` | Exit 0; contracts 6 / 62 and server 8 / 62 |
| `npm run check:all` | Exit 0; 86 files / 506 tests and all builds |
| `npm run simulate` | Exit 0; 100/100 legal winners, 65,341 commands, hash `1adc49e8` |
| `npm run e2e:online` | Exit 0; 2/2 passed |
| `npm run e2e:lobby` | Exit 0; all 6/6 accepted journeys passed |
| `npm run e2e` | Exit 0; 16/16 passed, including all eight accepted V1 journeys |
| `git diff --check` | Exit 0; repeated after final report update |

Known limits remain process-local server state, tab-scoped resume within existing grace, fixed
started seats and no delivery retry policy. Complete mixed-seat winner and rare workflow
qualification is the next task. No V2-09+ or unrelated future feature is implemented.

Passing task commit: `feat: connect online game gateway to the browser UI`. The next task records
its resolved hash after the required clean-tree commit boundary.

## V2-08 — Complete mixed Human and AI online gameplay

Status: NOT_STARTED

## Scope and remaining risks

No V2-09+ implementation, external writes, push, deployment, or history rewrite authorized.
Exactly one passing commit per task; continue automatically after each passing task gate.
V2-05 and V2-06 committed as `456ddfa` and `0b78c26`, with clean task boundaries. V2-07 gates passed;
its passing commit is the next operation. V2-08 remains to be implemented.
