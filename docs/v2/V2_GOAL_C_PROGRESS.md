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

Full task gate passed. Commit subject: `fix: harden multiplayer command delivery and concurrency`.

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

Status: NOT_STARTED

## V2-11 — Durable Room/Game recovery

Status: NOT_STARTED

## V2-12 — Security, deployment and alpha qualification

Status: NOT_STARTED

## Scope

Exactly four normal task commits are authorized, in the requested order. Nothing will
be pushed, merged, tagged, published or deployed. No post-V2-12 feature is in scope.
