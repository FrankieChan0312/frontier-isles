# Testing

Long-running AI and online-game checks require uninterrupted execution. Host sleep/Modern
Standby can pause Node and exhaust the existing test, heartbeat and acknowledgement deadlines.
Keep the verification host awake for the run; do not increase test timeouts to hide a host pause.

## Quality layers

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | Strict-check application, Node configuration, and Playwright TypeScript. |
| `npm run lint` | Lint all source, tests, scripts, and configuration with zero warnings. |
| `npm run test` | Run focused domain, engine, projection, AI, gateway, persistence, store, and UI tests. |
| `npm run build` | Type-check and produce the optimized static application in `dist/`. |
| `npm run check` | Run typecheck, lint, unit/integration tests, and production build in sequence. |
| `npm run simulate` | Run the separate 100-game deterministic release corpus. |
| `npm run e2e` | Run the Chromium browser release paths with Playwright. |
| `npm run e2e:lobby` | Run the two-context online Lobby and Single Player browser smoke paths. |
| `npm run check:server` | Strict-check, lint, test, and build the realtime server and shared contracts. |
| `npm run check:all` | Run the accepted V1 web check followed by all server/contracts checks. |

Server integration tests bind ephemeral ports and exercise the real Node HTTP and Socket.IO
boundaries. They do not require a server already running, a fixed port, credentials, or external
network access. The Lobby suite uses multiple real clients to prove Room creation/join, synchronized
Ready and Host AI-seat changes, public-safe rejection, leave behavior, and broadcast isolation.
The browser gateway also has a real ephemeral-server integration suite; UI component tests cover
online create/join, public errors, own Ready, and Host-only AI controls.

Session lifecycle tests use an injected fake clock/scheduler—never real 30-second or 30-minute
waits—to cover reconnect state, valid/expired resume, Ready preservation, Host transfer, last-Human
closure, and idle cleanup. Real Socket.IO clients additionally prove duplicate replacement, old
socket rejection, explicit snapshot resync, public closure notification, and transport disconnect.

The shared-contract suite validates every Goal A request and acknowledgement, strict extra-field
rejection, display-name normalization, branded domains, protocol mismatch, canonical seat order,
derived readiness, public-safe errors, JSON round trips, and the absence of private credentials in
`RoomSnapshot`.

## Deterministic release simulation

After V2-05, `npm run test` retains every accepted frontend/domain/AI test, with frontend,
game-core and game-ai totals reported separately. Package tests run without a DOM. Use
`npm run check:game` for both package boundaries, or `npm run check:core` / `npm run check:ai`
after building their dependencies. `npm run check:all` includes the package checks as well as
frontend, contracts and server verification. Workspace consumers are built in dependency order.
The release simulation runs the compiled portable runner in `packages/game-ai/dist` after
building from source; its seeds, algorithms and summary format are unchanged.

`npm run simulate` runs the fixed seeds `V1-RELEASE-001` through `V1-RELEASE-100` with rotating
Merchant, Builder, and Sentinel profiles. The harness routes every decision through `GameEngine`,
creates a fresh redacted view for the acting AI, and applies the complete resource, card, piece,
board, score, award, state-version, and RNG invariant chain after every accepted command.

Safety bounds are 100 AI commands per player turn, 20,000 commands per game, 2,000 turns per game,
and 12 identical command keys in one turn. A failure reports the seed, state version, turn, phase,
actor, command key, and violation or diagnostic. A successful run prints every game summary plus an
ordered deterministic hash.

The Stage 17 qualification run completed 100/100 legal games with 65,341 commands, at most 996
commands, 170 turns, and 467 RNG draws in a game. Winner counts were East 33, West 21, South 28,
and North 18. The ordered summary hash was `1adc49e8`.

The smaller development corpora remain available as `npm run simulate:core -- 32` and
`npm run simulate:mixed -- 32`.

## Browser E2E

V2-06 server checks include strict schemas for all 20 commands and every nested snapshot/event
field, online creation with two/three/four Humans, start eligibility, session-derived actors,
cached outcomes, redaction, bounded AI and active resume. Run `npm run check:server` for the
contract/server suite. `server/test/game.integration.test.ts` starts real Socket.IO clients,
plays setup through Human commands and server AI, synchronizes a normal roll, and checks
spoof/stale/duplicate rejection plus newest-tab authority and viewer-specific private events.
Its fixtures and dependency injection are confined to Node tests; no production fixture route exists.

V2-08 adds `online-full-games.test.ts`, `online-workflows.test.ts` and `online-privacy-audit.test.ts`.
They repeat complete 2H+2AI, 3H+1AI and 4H games through real Socket.IO/GameSession commands,
freeze prior state and validate all core invariants and exact RNG transitions after each command.
Each game is bounded by 5,000 commands and 1,000 turns. `npm run simulate:online` runs the same
six-game qualification and prints public summaries. Failure reports omit private command payloads,
hands, hidden cards, tokens and RNG cursors. Workflow cases explicitly cover all 20 command types,
production/shortage, awards, cards, every trade direction, second-counter rejection and shared victory.
See the [complete online coverage matrix](v2/V2_GOAL_B_ACCEPTANCE.md).

Install the pinned Playwright Chromium build once on a machine:

```sh
npx playwright install chromium
```

Then run:

```sh
npm run e2e
```

Playwright starts a private Vite server on `127.0.0.1:4173`, uses one Chromium worker, records a
trace on failure, and takes failure-only screenshots. The suite covers seeded creation, all Human
setup interactions, roll/end, a paid build, a controlled seven, maritime trade, AI domestic
negotiation, save/reload, deterministic victory, starting again, a 480px overflow smoke check,
accessible roles/names, and browser console/page errors.

For V2 it also starts the realtime server on `127.0.0.1:3001` with a test-only explicit CORS origin.
The test process is `tests/e2e/realtime-test-server.ts`, composed from the production server with
an injected fixed seed. `npm run e2e:online` runs the online game journeys separately. Two browsers
start the same game, complete shared initial setup through real commands, synchronize normal
turns, check private hands and public boards, refresh/resume and replace a tab. A WebSocket test
proxy changes one outgoing expected version to exercise real stale rejection and snapshot resync.
All three target viewport widths, accessibility/DOM privacy, no offline online-save writes and
console/React errors are checked. No online authoritative state is injected into the browser.
The online workflow journeys also exercise all development-card effects, dead-end free-road
completion, controlled seven, paid building, maritime and domestic negotiation, both awards and
victory/finished resume. Their invariant-valid fixtures are selected solely by the separate Node
test executable's explicit whitelist. Production cannot install them through a name, environment
variable or endpoint. Normal Lobby/setup browser journeys still use real seeded game creation.
`socket-game-gateway.test.ts` additionally verifies shared socket ownership, actor omission, stable
injected command IDs, no optimistic state advance, pending submission locks, wrong-viewer rejection,
missed/out-of-order publications, stale resync, replacement and listener disposal.
The Lobby path uses two independent browser contexts to compare authoritative public seat state,
synchronize Ready and AI changes, smoke-test Single Player, and check 1440×900, 1024×768, and
480×800 layouts for horizontal overflow and console/React errors.

Its recovery paths refresh a Ready Human into the same SessionId/SeatId, copy a credential into a
duplicate tab to prove newest-wins replacement, transfer Host after leave, and retain synchronized
Ready/AI state through resume.

V2-09 adds queue, fingerprint and retention tests in `server/test/game-delivery.test.ts` and real
Socket.IO concurrency/reconnect coverage in `server/test/game-delivery.integration.test.ts`.
The latter holds an AI decision while another Room on the same server progresses, replaces a
socket with work queued, races same-session/current/non-current commands and competing trade
responders, and resumes pending trade/discard/robber decisions before replaying their saved requests.
Every accepted command family in `online-workflows.test.ts` is replayed after AI advancement,
checking exact outcomes, unchanged projected state and unchanged publication counts.
Gateway tests drop/delay acknowledgements, delay requests, reconnect unresolved commands, exhaust
bounded retries, cancel work on replacement/completion and reject malformed snapshots without
poisoning the view. `tests/e2e/online-delivery.spec.ts` uses a test-owned WebSocket proxy to drop an
acknowledgement and to send simultaneous exact/conflicting requests. It checks visible pending
delivery, stable retry payloads, one build/event and safe conflict results through real browsers.
No source timeout, assertion or accepted regression journey is relaxed for those tests.

V2-10 adds `server/test/game-presence.test.ts` with an injected clock and held AI choices:
current/non-current Human disconnect, exact grace boundaries, private discard/robber/trade
retention, multiple disconnects, Host transfer, same-PlayerId AI takeover, pause-safe AI resume,
abandoned/finished cleanup and disposal races. Actual socket presence integration tests reject
non-Host, stale, spoofed and wrong-game intents and prove private discard redaction on takeover.
Contract tests reject contradictory presence, extra/private fields and invalid deadlines.
Gateway tests cover pause/replacement, duplicate-tab authority and closure cleanup; UI tests
prove countdown zero cannot authorize replacement and live timers are disposed.
`tests/e2e/online-presence.spec.ts` uses real WebSocket interruption and the unchanged 30-second
grace for reconnect, Host expiry/AI takeover, duplicate tabs during pause, and explicit closure.
It checks public metadata, credential invalidation, privacy, disabled gameplay and all three
required viewport widths. Successful replacement screenshots are stored under `test-results/`.

The V1 UAT regression paths additionally load an accepted pending AI offer, edit both complete
counter bundles above one, prove a favorable AI acceptance and an unfavorable AI rejection without
a second counter, and buy a known schema-valid Development Card. The card path asserts the exact
owner-only type, original description, lifecycle status, disabled reason, confirmation event, and
save/reload retention.

Bank/supply regressions assert the initial 19×5 resource supply and 25-card count, view redaction,
visible zeroes, accepted build/discard/maritime/purchase deltas, exact save/reload retention, and
fail-closed negative, fractional, malformed, extra-key, and conservation-breaking save data. E2E
DOM checks reject authoritative deck fields and card identities while verifying immediate updates.

Long setup paths use schema-valid localStorage saves constructed with accepted engine test helpers
and serialized through the production save format. No fixture switch, debug route, or test backdoor
is compiled into production code.
