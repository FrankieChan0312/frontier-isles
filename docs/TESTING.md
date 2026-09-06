# Testing

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
The Lobby path uses two independent browser contexts to compare authoritative public seat state,
synchronize Ready and AI changes, smoke-test Single Player, and check 1440×900, 1024×768, and
480×800 layouts for horizontal overflow and console/React errors.

Its recovery paths refresh a Ready Human into the same SessionId/SeatId, copy a credential into a
duplicate tab to prove newest-wins replacement, transfer Host after leave, and retain synchronized
Ready/AI state through resume.

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
