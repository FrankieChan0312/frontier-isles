# Frontier Isles

> Working title for a browser-based, Catan-inspired strategy board game.

## Current status

Tasks 00–08 provide the React application foundation, pure TypeScript contracts, deterministic topology and board content, a responsive accessible raw-SVG topology preview, authoritative game creation, complete four-player snake-order setup, deterministic dice production, clockwise turn advancement, the complete discard/robber/random-theft workflow created by a rolled seven, and authoritative paid road, settlement, and city actions. Remaining Action-phase rules are future work.

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
10. `tasks/TASK_01_DOMAIN_CONTRACTS.md`
11. `tasks/TASK_02_STANDARD_BOARD_TOPOLOGY.md`
12. `tasks/TASK_03_RESPONSIVE_SVG_BOARD_RENDERER.md`
13. `tasks/TASK_04_SEEDED_STANDARD_BOARD_CONTENT.md`
14. `tasks/TASK_05_GAME_CREATION_AND_INITIAL_SETUP.md`
15. `tasks/TASK_06_DICE_PRODUCTION_AND_TURN_LIFECYCLE.md`
16. `tasks/TASK_07_DISCARD_ROBBER_AND_THEFT_WORKFLOW.md`
17. `tasks/TASK_08_PAID_BUILDING_ACTIONS.md`

The current implementation includes **Tasks 00–08**, through deterministic seven resolution and paid Action-phase road, settlement, and city construction. The landing page remains a static neutral topology preview; authoritative terrain, numbers, robber, buildings, and roads are not rendered. Development-card purchase/play, trade, awards, scoring, AI, networking, persistence, and additional gameplay UI are not implemented.

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

See the [product documentation](docs/PRODUCT_SCOPE.md), [architecture](docs/ARCHITECTURE.md), [board model](docs/BOARD_MODEL.md), and task specifications under [tasks](tasks/) for scope and design details.

## Working ruleset identifier

```text
BASE_4P_COMBINED_ACTION_V1
```

This identifier means a fixed four-player base-game ruleset with one human and three AI players, variable setup, a combined action phase in which trading and building may be interleaved, and no expansion or house rules.

## Intellectual-property boundary

This project may reproduce factual game mechanics for learning and prototyping, but it must not copy CATAN logos, official artwork, card illustrations, rulebook prose, branded UI, sound assets, or other protected presentation. Public builds use original names, text, artwork, icons, and visual design.
