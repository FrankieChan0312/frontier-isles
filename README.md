# Frontier Isles

> Working title for a browser-based, Catan-inspired strategy board game.

## Current status

Task 00 provides the React, TypeScript, Vite, MUI, Zustand, and test foundation plus a minimal landing screen. No gameplay code exists yet.

V1 target:

- One human player and three AI players
- Browser-only single-player application
- React + TypeScript + Vite
- Material UI for application UI
- Raw SVG for the board
- Pure TypeScript authoritative game engine
- Heuristic, non-cheating AI
- Seeded deterministic randomness
- Local save/resume
- No backend, login, database, or online multiplayer in V1

## Start here

Read in this order:

1. `AGENTS.md`
2. `docs/PRODUCT_SCOPE.md`
3. `docs/GAME_RULES.md`
4. `docs/ARCHITECTURE.md`
5. `docs/BOARD_MODEL.md`
6. `docs/AI_DESIGN.md`
7. `docs/TRADE_AI.md`
8. `docs/CODING_STANDARDS.md`
9. `tasks/TASK_00_PROJECT_FOUNDATION.md`

The first implementation task is **Task 00: Project Foundation**. It must not implement game rules, board topology, AI behaviour, networking, or persistence.

## Local development

### Prerequisites

- Node.js 24 or another version supported by the current Vite release
- npm 11 or a compatible npm version

Install dependencies:

```sh
npm install
```

Start the development server:

```sh
npm run dev
```

Run individual quality checks:

```sh
npm run typecheck
npm run lint
npm run test
npm run build
```

Run the complete quality suite:

```sh
npm run check
```

See the [product documentation](docs/PRODUCT_SCOPE.md), [architecture](docs/ARCHITECTURE.md), and [Task 00 specification](tasks/TASK_00_PROJECT_FOUNDATION.md) for scope and design details.

## Working ruleset identifier

```text
BASE_4P_COMBINED_ACTION_V1
```

This identifier means a fixed four-player base-game ruleset with one human and three AI players, variable setup, a combined action phase in which trading and building may be interleaved, and no expansion or house rules.

## Intellectual-property boundary

This project may reproduce factual game mechanics for learning and prototyping, but it must not copy CATAN logos, official artwork, card illustrations, rulebook prose, branded UI, sound assets, or other protected presentation. Public builds use original names, text, artwork, icons, and visual design.
