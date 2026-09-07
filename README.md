# Frontier Isles

Frontier Isles is an original island strategy game. The accepted V1 release candidate remains a
browser-only experience for one Human and three heuristic AI players, with a deterministic
TypeScript rules engine, a complete Material UI and raw SVG interface, and resumable browser saves.
V2 adds a Node.js/Socket.IO server, authoritative four-seat Rooms and games, and a synchronized
browser Lobby and online Game screen alongside unchanged Single Player.

## V1 features

- Seeded four-player game creation and reproducible board generation
- Complete setup, dice production, robber/discard/theft, building, awards, scoring, and victory
- Development cards plus domestic and maritime trading
- Merchant, Builder, and Sentinel AI personalities that use redacted player views
- Responsive, keyboard-operable raw SVG board and accessible MUI dialogs
- Automatic and manual save/resume using one versioned local browser save
- Deterministic 100-game release simulation and repeatable Chromium E2E suite

The working ruleset identifier is `BASE_4P_COMBINED_ACTION_V1`.

## Run locally

Prerequisites are Node.js 24 and a compatible npm 11 release.

```sh
npm ci
npm run dev:web
```

Open the URL printed by Vite. Enter a name and seed, or keep the materialized seed shown on the Home
screen. A successful command is saved automatically; **Save** also persists immediately. **Continue
saved game** resumes the single latest save for the current browser origin.

For Online Multiplayer, run both development commands below, enter a display name, then create a
Room or join its six-character code from a second browser context. The Host assigns AI to remaining
empty seats; with at least two connected Humans and all Humans Ready, the Host can Start Game.
Every Human enters the same server game with their own private view. Refresh within 30 seconds
resumes the same tab-scoped Human session and current game. Waiting Rooms expire after 30 minutes
without accepted activity. Online games have no browser save; Single Player saves remain separate.

Online actions use an ordered delivery queue with bounded acknowledgement retries. A retry keeps
the same request and command ID; the server serializes Human and AI mutations per game and rejects
conflicting reuse. Sending, retry, reconnect and resync states are visible. If delivery remains
uncertain, use the fresh authoritative view and **Resync game** before deciding on a new action.
See [the delivery ADR](docs/v2/ADR-V2-0010-command-delivery-and-serialized-execution.md).

## Quality and release commands

```sh
npm run typecheck
npm run lint
npm run test
npm run build
npm run check
npm run simulate
npm run simulate:online
npx playwright install chromium
npm run e2e
npm run e2e:lobby
npm run e2e:online
```

`npm run simulate` executes 100 fixed mixed-profile games with invariants checked after every
accepted command. Playwright browser installation is a one-time machine prerequisite for E2E.
`npm run simulate:online` runs complete real Socket.IO games for 2H+2AI, 3H+1AI and 4H, each twice
to verify identical seeded summaries. The [Goal B acceptance matrix](docs/v2/V2_GOAL_B_ACCEPTANCE.md)
maps all 20 command families to server and browser coverage.

## V2 workspace foundation

Start the unchanged V1 web client and the realtime foundation in separate terminals:

```sh
npm run dev:web
npm run dev:server
```

The server defaults to `http://127.0.0.1:3001`, exposes `GET /health`, and accepts credentialed
Socket.IO connections only from `CLIENT_ORIGIN` (default `http://127.0.0.1:5173`). The browser uses
the validated `VITE_REALTIME_URL` origin (default `http://127.0.0.1:3001`). The server owns
in-memory four-seat waiting Rooms for create, join, Ready, Host-managed AI seats, snapshot, and
leave, with validated `RECONNECT_GRACE_MS` and `ROOM_IDLE_TTL_MS` lifecycle settings. Accepted
`room:start` creates one server-owned GameSession, fixes its seats, and publishes per-Human views.
AI executes on the server. Copy the
non-secret `.env.example` values into your process environment when overrides are needed; no
`.env` file is committed.

```sh
npm run check:server
npm run check:all
```

The V2 foundation requires Node.js 24 LTS. See the
[V2 architecture baseline](docs/v2/V2_ARCHITECTURE_BASELINE.md) and
[foundation ADR](docs/v2/ADR-V2-0001-node-socket-io-workspace-foundation.md).

## Production build

`npm run build` writes the static web client to `dist/`. Its Single Player mode requires
no server, secret, runtime environment variable, or API. See [deployment](docs/DEPLOYMENT.md), the
[release checklist](docs/RELEASE_CHECKLIST.md), [testing](docs/TESTING.md), and
[known limitations](docs/KNOWN_LIMITATIONS.md).

## Architecture and privacy boundary

The pure `packages/game-core/src/**` engine owns legality and deterministic state transitions.
`packages/game-ai` depends only on core and supplies the shared deterministic AI and simulations.
Run `npm run check:game` to verify both package boundaries. Human and AI
players submit the same command contracts through `GameGateway`. React, MUI, and Zustand receive a
viewer-specific `PlayerView` and redacted events, not an unrestricted opponent hand, development
deck, or RNG cursor. Browser localStorage necessarily holds the authoritative offline save, but it
is not rendered or placed in UI stores.
Online mode uses SocketGameGateway on the Lobby's attached socket. Commands omit actor identity,
which the server derives from the Human session. Reconnect, stale responses and **Resync game**
request a fresh authoritative view. Delivery retries, extended disconnect policy and durable game
recovery remain later milestones; see [Goal B progress](docs/v2/V2_GOAL_B_PROGRESS.md).

Start with [AGENTS.md](AGENTS.md), [product scope](docs/PRODUCT_SCOPE.md),
[game rules](docs/GAME_RULES.md), and [architecture](docs/ARCHITECTURE.md) before changing code.

## Project boundary

V1 has no backend, login, database, networking, online multiplayer, telemetry, or cloud save. It
uses original presentation and does not include CATAN logos, official artwork, card images, or
rulebook prose.
