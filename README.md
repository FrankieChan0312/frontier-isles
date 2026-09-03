# Frontier Isles

Frontier Isles is an original, browser-only strategy board game for one Human and three heuristic
AI players. The V1 release candidate runs entirely on the local device: it has a deterministic
TypeScript rules engine, a complete Material UI and raw SVG interface, and resumable browser saves.

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
npm run dev
```

Open the URL printed by Vite. Enter a name and seed, or keep the materialized seed shown on the Home
screen. A successful command is saved automatically; **Save** also persists immediately. **Continue
saved game** resumes the single latest save for the current browser origin.

## Quality and release commands

```sh
npm run typecheck
npm run lint
npm run test
npm run build
npm run check
npm run simulate
npx playwright install chromium
npm run e2e
```

`npm run simulate` executes 100 fixed mixed-profile games with invariants checked after every
accepted command. Playwright browser installation is a one-time machine prerequisite for E2E.

## Production build

`npm run build` writes the static release to `dist/`. No server, secret, runtime environment
variable, or API is required. See [deployment](docs/DEPLOYMENT.md), the
[release checklist](docs/RELEASE_CHECKLIST.md), [testing](docs/TESTING.md), and
[known limitations](docs/KNOWN_LIMITATIONS.md).

## Architecture and privacy boundary

The pure `src/game/**` engine owns legality and deterministic state transitions. Human and AI
players submit the same command contracts through `GameGateway`. React, MUI, and Zustand receive a
viewer-specific `PlayerView` and redacted events, not an unrestricted opponent hand, development
deck, or RNG cursor. Browser localStorage necessarily holds the authoritative offline save, but it
is not rendered or placed in UI stores.

Start with [AGENTS.md](AGENTS.md), [product scope](docs/PRODUCT_SCOPE.md),
[game rules](docs/GAME_RULES.md), and [architecture](docs/ARCHITECTURE.md) before changing code.

## Project boundary

V1 has no backend, login, database, networking, online multiplayer, telemetry, or cloud save. It
uses original presentation and does not include CATAN logos, official artwork, card images, or
rulebook prose.
