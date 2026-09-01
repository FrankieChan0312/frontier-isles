# Task 00 — Project Foundation

## Status

Ready for Codex implementation.

## Objective

Create a clean, runnable React + TypeScript project foundation for Frontier Isles. Configure MUI, Roboto, Zustand, Vitest, React Testing Library, strict TypeScript, linting, required scripts, folder boundaries, and a minimal themed landing screen.

This task does **not** implement any game mechanic.

## Mandatory reading

Before coding, read:

- `AGENTS.md`
- `docs/PRODUCT_SCOPE.md`
- `docs/ARCHITECTURE.md`
- `docs/CODING_STANDARDS.md`
- `docs/adr/ADR-0001-v1-architecture-baseline.md`

Do not implement content from later domain documents yet.

## Environment preflight

1. Print `node --version` and `npm --version`.
2. Current Vite requires a compatible modern Node version. If the installed Node version is unsupported by the scaffold, stop with a precise message; do not install or replace global Node automatically.
3. Inspect the repository before writing.
4. Preserve `AGENTS.md`, `README.md`, `docs/**`, and `tasks/**`.

## Scaffold

Use the current official Vite React TypeScript template with npm.

Because this repository is already non-empty, scaffold in a temporary sibling/subdirectory, then merge only the required Vite project files into the repository root. Do not overwrite the supplied governance/documentation files. Remove the temporary scaffold after a successful merge.

Use the standard React TypeScript template, not React Compiler, unless an official scaffold change makes the standard template unavailable. Do not add a router.

## Approved runtime dependencies

Install:

```text
@mui/material
@emotion/react
@emotion/styled
@fontsource/roboto
zustand
```

`@mui/icons-material` is optional in Task 00 and should be installed only if the minimal landing screen actually uses an icon. Prefer no icon dependency yet.

## Approved development dependencies

Install/configure:

```text
vitest
jsdom
@testing-library/react
@testing-library/jest-dom
@testing-library/user-event
```

Keep the Vite template's supported ESLint setup. Use flat config. Do not add Playwright, Storybook, Tailwind, Redux, React Router, TanStack Router, Immer, Zod, or a backend dependency in this task.

## TypeScript configuration

Retain compatibility with the current Vite template and enable strict checks described in `docs/CODING_STANDARDS.md`, including where compatible:

```text
strict
noUncheckedIndexedAccess
exactOptionalPropertyTypes
noImplicitOverride
noFallthroughCasesInSwitch
noUnusedLocals
noUnusedParameters
useUnknownInCatchVariables
isolatedModules
```

Do not weaken a template setting merely to remove a warning.

## Required npm scripts

Ensure `package.json` provides:

```json
{
  "scripts": {
    "dev": "vite",
    "typecheck": "tsc -b --pretty false",
    "lint": "eslint . --max-warnings 0",
    "test": "vitest run",
    "test:watch": "vitest",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "check": "npm run typecheck && npm run lint && npm run test && npm run build"
  }
}
```

Adjust only where the generated template genuinely requires an equivalent command. Explain any difference.

## Vitest setup

Configure:

- `jsdom` environment for UI tests
- A setup file importing `@testing-library/jest-dom/vitest`
- Automatic cleanup through the supported Testing Library/Vitest integration
- Restored mocks between tests where appropriate

Add at least one component smoke test that verifies the landing screen through accessible text/roles.

## MUI and theme

Create a small theme module under `src/theme/`.

Requirements:

- `ThemeProvider`
- `CssBaseline`
- Font family uses Roboto
- Import Fontsource weights 300, 400, 500, and 700 in the application entry point
- Central theme tokens rather than scattered styling constants
- Original, neutral placeholder styling; no official CATAN visual copying

## Minimal screen

Replace the Vite demo with a minimal landing screen showing:

```text
Frontier Isles
Single-player strategy game
Architecture foundation ready
```

Include one disabled or non-functional `New Game` button clearly marked as not implemented, or omit the button. Do not create fake game state, a mock board, dice logic, or AI logic.

The screen should be responsive, use semantic headings, and render without console errors.

## Source folders

Create the agreed top-level source/test folders without speculative implementation:

```text
src/app
src/game/contracts
src/game/model
src/game/board
src/game/engine
src/game/rules
src/game/selectors
src/game/random
src/ai/agents
src/ai/evaluation
src/ai/goals
src/ai/memory
src/ai/trade
src/application/controllers
src/application/gateways
src/application/stores
src/infrastructure/persistence
src/ui/board
src/ui/components
src/ui/dialogs
src/ui/pages
src/ui/panels
src/theme
tests/fixtures
tests/integration
tests/replays
tests/e2e
```

Git does not retain empty folders. Use a short local `README.md` only where needed, or create folders as later tasks require. Do not fill them with placeholder classes/interfaces.

## Architecture lint guard

Add an ESLint override/restriction, if cleanly supported by the generated flat config, so files under `src/game/**` cannot import:

```text
react
react-dom
@mui/*
zustand
src/ui/*
src/application/*
src/infrastructure/*
src/ai/*
```

If a robust path restriction would require another package, do not add that package in Task 00. Document the limitation and at minimum enforce the external-package restrictions available with core ESLint rules.

## README update

Update root `README.md` without deleting its project/scope information. Add:

- Prerequisites
- Install command
- Development command
- Quality commands
- Current implementation status
- Link to the docs and Task 00

## Forbidden work

Do not implement:

- Domain IDs or `GameState`
- Commands/events
- Board coordinates or topology
- SVG hexes
- Rules
- Dice
- Resources
- AI
- Trade evaluation
- Zustand game stores
- Persistence
- Routing
- Backend/network code
- Deployment workflow

## Acceptance criteria

1. `npm install` succeeds and lockfile exists.
2. `npm run dev` can start the app.
3. Landing screen renders with MUI and Roboto.
4. No Vite demo assets/content remain unless technically required.
5. Vitest/Testing Library smoke test passes.
6. Strict TypeScript passes.
7. ESLint passes with zero warnings.
8. Production build passes.
9. `npm run check` passes.
10. No game feature or future infrastructure is implemented.
11. Documentation/governance files remain present.

## Completion report

Follow the exact report format required by `AGENTS.md`. Include the printed Node/npm versions and exact command outcomes.
