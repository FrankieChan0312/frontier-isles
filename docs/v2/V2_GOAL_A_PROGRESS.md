# Frontier Isles V2 Goal A Progress

Goal: `V2_GOAL_A_TWO_BROWSER_LOBBY_V1`
Branch: `feat/v2-online-multiplayer`
Baseline HEAD: `c98138a`

## Accepted V1 preflight

- `npm run check`: PASS on rerun — 63 test files, 348 tests, production build successful.
- Focused timeout diagnosis: PASS — the three tests that timed out during the first CPU-contended
  aggregate run passed in isolation (3 files, 5 tests); no assertion failure was found.
- `npm run simulate`: PASS — 100/100 games, 65,341 commands, maximum 996 commands, 170 turns,
  467 random draws; deterministic summary hash `1adc49e8`.
- `npm run e2e`: PASS — 8/8 Chromium tests.
- Node.js: `v24.19.0`; npm: `11.17.0`.
- Working tree was clean before Goal A implementation began.

## Stages

### V2-00 — Multiplayer workspace foundation

Status: COMPLETE

Implemented:

- Added npm workspaces while leaving the accepted V1 frontend at repository root.
- Added strict private `@frontier-isles/realtime-contracts` and `@frontier-isles/server` packages.
- Added validated `PORT`, `CLIENT_ORIGIN`, and `NODE_ENV` configuration, exact `GET /health`, safe
  JSON 404s, credentialed explicit-origin CORS, typed Socket.IO initialization, and idempotent
  graceful shutdown for `SIGINT`/`SIGTERM`.
- Added root web/server development, build, typecheck, test, and aggregate check scripts.
- Added the non-secret `.env.example`, workspace documentation, and ADR-V2-0001.
- Added 18 focused tests: 2 shared-contract tests and 16 server configuration/HTTP/Socket.IO tests.

Dependencies:

- `socket.io@4.8.3` — production realtime transport on the Node HTTP server.
- `socket.io-client@4.8.3` — server integration-test client only in V2-00.
- `tsx@4.23.13` — local TypeScript server development runner.

Verification:

- `npm ci`: PASS — 326 packages installed, 329 audited, 0 vulnerabilities.
- `npm run typecheck`: PASS.
- `npm run lint`: PASS with zero warnings.
- `npm run test`: PASS — 63 files, 348 tests.
- `npm run build`: PASS — 992 modules transformed; accepted bundle-size advisory only.
- `npm run check`: PASS — 63 files, 348 tests, production build.
- `npm run simulate`: PASS — 100/100 games, 65,341 commands, hash `1adc49e8`.
- `npm run check:server`: PASS — contracts 1 file/2 tests; server 2 files/16 tests; builds pass.
- `npm run check:all`: PASS — accepted web check plus server/contracts check.
- `git diff --check`: PASS (line-ending conversion notices only).

Audit:

- No Room, Session, Lobby UI, online game, server `GameState`, deployment, or V2-01+ behavior.
- No `Math.random()` in game/AI/server/contracts, wildcard CORS, credential, or `socket.id` identity.
- Existing `LocalGameGateway` and all deterministic V1 source remain unchanged.

### V2-01 — Versioned realtime protocol contracts

Status: COMPLETE

Implemented:

- Added strict runtime schemas and readonly TypeScript contracts for RoomCode, SessionId,
  ResumeToken, SeatId, RoomRevision, normalized display names, AI profiles, connection/lifecycle
  status, readiness blockers, and the complete safe-error union.
- Added the canonical four-seat `RoomSnapshot`, semantic Host/readiness validation, private session
  credential, and discriminated success/failure acknowledgement contracts.
- Added typed Socket.IO maps and schemas for all eight Goal A client events and all five server
  events. The server foundation now consumes the shared maps without adding Room handlers.
- Added ADR-V2-0002 and updated architecture/testing documentation.
- Added 36 tests, bringing the shared-contract suite to 5 files/38 tests.

Dependency:

- `zod@4.5.4` — the single strict runtime-validation implementation shared by browser and server;
  no duplicate validators were added to either consumer.

Verification:

- `npm run typecheck`: PASS.
- `npm run lint`: PASS with zero warnings.
- `npm run test`: PASS — 63 files, 348 V1 tests.
- `npm run build`: PASS — 992 modules transformed; accepted bundle-size advisory only.
- `npm run check`: PASS — 63 files, 348 tests, production build.
- `npm run simulate`: PASS — 100/100 games, 65,341 commands, hash `1adc49e8`.
- `npm run check:server`: PASS — contracts 5 files/38 tests; server 2 files/16 tests; builds pass.
- `npm run check:all`: PASS — accepted web check plus server/contracts check.
- `git diff --check`: PASS (line-ending conversion notices only).

Audit:

- `RoomSnapshot` strictly rejects extra/private fields and contains no ResumeToken, digest, socket
  ID, IP, timer internals, GameState, RNG, or private game data.
- Client requests contain no trusted actor identity; the future server service must derive it from
  the attached session.
- Contracts import no Node server, React, MUI, Zustand, browser, or game implementation module.
- No Room service, online game execution, game-command protocol, or V2-02+ behavior was added.

### V2-02 — In-memory Room and Lobby server

Status: NOT_STARTED

### V2-03 — Synchronized Online Lobby web interface

Status: NOT_STARTED

### V2-04 — Session recovery and Room lifecycle

Status: NOT_STARTED
