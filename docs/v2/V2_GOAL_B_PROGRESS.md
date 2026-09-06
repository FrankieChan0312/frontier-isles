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
Package builds, root typecheck and zero-warning lint PASS. Full task gate and commit pending.

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
  The failed aggregate and remaining gates are being rerun.
- Aggregate reruns `check`, `check:server`, and `check:all`: exit 0. Contracts remain 5 files /
  38 tests and server remains 5 files / 43 tests. The extracted release corpus passed 100/100
  winners, 65,341 commands, maximum 996 commands / 170 turns / 467 random draws, hash `1adc49e8`.
- First extracted Lobby browser run: 5/6 passed; refresh returned an expired-session message
  during a roughly one-minute test. Screenshot showed the safe Home error. The unchanged
  focused refresh rerun passed in 4.4 seconds; full browser reruns are pending. No grace,
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
`refactor: extract shared game core and AI packages` (hash recorded at the next task boundary).

## V2-06 — Server-authoritative multiplayer game sessions

Status: NOT_STARTED

The accepted Lobby requires explicit Host AI assignment for every remaining empty seat.
Start will reject empty seats using the existing authoritative readiness projection.
The V1 one-Human creation policy needs an explicit documented online creation boundary;
V1 creation and save validation must retain their accepted restrictions.

## V2-07 — SocketGameGateway and online UI

Status: NOT_STARTED

## V2-08 — Complete mixed Human and AI online gameplay

Status: NOT_STARTED

## Scope and remaining risks

No V2-09+ implementation, external writes, push, deployment, or history rewrite authorized.
Exactly one passing commit per task; continue automatically after each passing task gate.
Current work is incomplete and has no Goal B implementation commit yet.
