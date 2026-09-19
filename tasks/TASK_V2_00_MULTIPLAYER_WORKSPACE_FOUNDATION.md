# Task V2-00 — Multiplayer Workspace Foundation

Status: Ready for Codex  
Task ID: `V2-00_MULTIPLAYER_WORKSPACE_FOUNDATION`

## 1. Goal

Add a minimal, production-shaped Node.js + TypeScript + Socket.IO server foundation to the accepted Frontier Isles repository while preserving the complete V1 browser game.

This task establishes workspace, build, configuration, health, connection, testing, and documentation boundaries only.

It does not implement Rooms, Lobby behavior, online game commands, or frontend multiplayer UI.

## 2. Mandatory preflight

Before changing source:

1. Read repository-root `AGENTS.md`.
2. Read `README.md`.
3. Read relevant accepted architecture/testing/deployment documents.
4. Read:
   - `docs/v2/V2_PRODUCT_SCOPE.md`
   - `docs/v2/V2_ARCHITECTURE_BASELINE.md`
   - `docs/v2/V2_ROADMAP.md`
   - this task
5. Confirm the current branch is a V2 feature branch and not `main`.
6. Confirm the working tree is clean except for supplied V2 planning/task files.
7. Run the accepted V1 baseline:
   - `npm run check`
   - `npm run simulate`
8. Record exact baseline totals.
9. Do not continue if accepted V1 checks fail before source changes.

## 3. Branch expectation

Use:

```text
feat/v2-online-multiplayer
```

Do not create commits in this task. The Human creates the checkpoint after review.

## 4. Node baseline

Use Node.js 24 LTS.

Add a documented runtime requirement compatible with the user's accepted Node 24 environment. Do not switch to Node 26 Current.

Recommended engine boundary:

```json
{
  "node": ">=24 <25"
}
```

Do not alter the deterministic game RNG or use Node network entropy inside authoritative game/AI packages.

## 5. Workspace structure

Add npm workspaces without moving the accepted V1 frontend:

```text
workspaces:
- server
- packages/*
```

Create:

```text
server/
├── package.json
├── tsconfig.json
├── src/
│   ├── config.ts
│   ├── create-http-server.ts
│   ├── create-realtime-server.ts
│   ├── server.ts
│   └── graceful-shutdown.ts
└── test/
    ├── health.test.ts
    └── socket-connection.test.ts

packages/
└── realtime-contracts/
    ├── package.json
    ├── tsconfig.json
    ├── src/
    │   ├── protocol-version.ts
    │   ├── health.ts
    │   └── index.ts
    └── test/
        └── contracts.test.ts

docs/
└── v2/
    └── ADR-V2-0001-node-socket-io-workspace-foundation.md
```

Equivalent focused filenames are acceptable, but do not create speculative Room/Game files.

## 6. Server package

Create a private package:

```text
@frontier-isles/server
```

Use:

- Node `http`
- TypeScript
- Socket.IO 4.x
- `tsx` for local development
- Vitest for server tests
- `socket.io-client` only where required for integration testing

Do not add Express, NestJS, Fastify, Redis, database, authentication, or deployment platform SDKs.

## 7. Shared protocol package

Create a private package:

```text
@frontier-isles/realtime-contracts
```

For this task it contains only:

- `REALTIME_PROTOCOL_VERSION`
- health response contract
- service identity constants required by health/connection tests

Do not define the full Room protocol in V2-00. That belongs to V2-01.

All exports must be plain JSON-compatible values/types.

## 8. Environment configuration

Support:

```text
PORT
CLIENT_ORIGIN
NODE_ENV
```

Defaults for local development:

```text
PORT=3001
CLIENT_ORIGIN=http://127.0.0.1:5173
NODE_ENV=development
```

Requirements:

- parse once at process boundary;
- validate port range;
- reject malformed/empty origin;
- do not silently accept `*` when credentials are enabled;
- no committed `.env`;
- add/update `.env.example` with non-secret values;
- no secret or resume token exists in this task.

## 9. HTTP health endpoint

Implement:

```text
GET /health
```

Success:

```json
{
  "status": "ok",
  "service": "frontier-isles-realtime",
  "protocolVersion": "<REALTIME_PROTOCOL_VERSION>"
}
```

Requirements:

- status 200;
- `content-type: application/json`;
- other unknown HTTP paths return a safe 404;
- no Express;
- test using an ephemeral port;
- no wall-clock field in the health response.

## 10. Socket.IO foundation

Attach Socket.IO to the same HTTP server.

Requirements:

- explicit CORS allowlist from validated `CLIENT_ORIGIN`;
- typed server initialization;
- successful client connection test;
- clean client disconnect test;
- no application events except Socket.IO lifecycle;
- no Room join;
- no Lobby snapshot;
- no use of `socket.id` as domain identity;
- no connection-state recovery yet;
- no server-side game state.

## 11. Graceful shutdown

Provide a testable shutdown boundary that:

- stops accepting new HTTP connections;
- closes Socket.IO;
- closes the HTTP server;
- handles `SIGINT` and `SIGTERM` in the process entrypoint;
- does not call `process.exit()` from reusable modules;
- avoids duplicate shutdown execution.

## 12. Root scripts

Preserve accepted V1 scripts and add clear multiplayer scripts.

Required conceptual scripts:

```text
dev:web
dev:server
build:server
typecheck:server
test:server
check:server
check:all
```

`check:all` must run accepted web checks plus server/contracts checks.

A combined two-process development script may be added only with a justified lightweight dev dependency. Two-terminal development is acceptable and avoids an unnecessary dependency.

## 13. TypeScript and lint boundaries

- Server compiles under strict TypeScript.
- Reuse root ESLint configuration where practical.
- Do not weaken existing lint rules.
- `server/**` may import:
  - Node built-ins
  - Socket.IO
  - `@frontier-isles/realtime-contracts`
- `server/**` must not import React, MUI, Zustand, browser persistence, or frontend UI.
- `packages/realtime-contracts/**` must not import server, React, MUI, Zustand, browser APIs, or authoritative game implementation.
- Existing `src/game/**` import restrictions remain unchanged.

## 14. Tests

Add focused tests proving:

1. Protocol version and health contract are stable.
2. Invalid port/config values fail fast.
3. `/health` returns the exact accepted payload.
4. Unknown path returns 404.
5. Socket.IO client can connect to an ephemeral test server.
6. Client can disconnect and the server closes cleanly.
7. CORS configuration is not wildcard.
8. Shutdown is idempotent.
9. Existing V1 tests and simulations remain unchanged.
10. No Room or game event exists yet.

Tests must not rely on fixed port 3001.

## 15. Documentation

Update narrowly:

- root README: V1 remains available; V2 foundation commands
- architecture: link to `docs/v2`
- testing: server/workspace checks
- `.env.example`
- ADR for:
  - Node 24 LTS
  - npm workspaces
  - Node `http`
  - Socket.IO
  - no Express
  - no Room logic in foundation

Do not rewrite V1 game-rule documentation.

## 16. Required verification

Run and fix:

```text
npm ci
npm run typecheck
npm run lint
npm run test
npm run build
npm run check
npm run simulate
npm run typecheck:server
npm run test:server
npm run build:server
npm run check:server
npm run check:all
git diff --check
```

If root scripts are reorganized, preserve equivalent accepted V1 checks and report the exact mapping.

Audit production code for:

- accidental `Math.random()` in game/AI
- committed secrets
- wildcard CORS
- imported frontend dependencies in server
- imported server dependencies in shared contracts

## 17. Forbidden scope

Do not implement:

- Room creation
- Room joining
- Ready state
- Host
- AI seats
- Lobby UI
- session/resume tokens
- reconnect
- connection-state recovery
- runtime Room schemas
- GameSession
- GameState on server
- SocketGameGateway
- database
- Redis
- authentication
- deployment
- V1 source relocation
- game-core extraction
- changes to base-game rules

## 18. Completion report

Return:

1. files created/changed;
2. workspace/package structure;
3. dependencies and exact versions added;
4. configuration contract;
5. health and Socket.IO behavior;
6. scripts added;
7. tests added;
8. exact verification output/totals;
9. V1 regression/simulation result and hash;
10. deviations/blockers;
11. explicit forbidden-scope confirmation;
12. confirmation no Git commit was created.
