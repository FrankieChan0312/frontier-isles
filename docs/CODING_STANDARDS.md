# Coding Standards

## 1. Language and build

- TypeScript strict mode
- ECMAScript modules
- React functional components
- Vite application build
- Vitest for unit/integration tests
- React Testing Library for component behaviour
- MUI for application UI
- Raw SVG for the board

Vite transpilation is not accepted as type checking; `npm run typecheck` remains a separate required command.

## 2. Compiler expectations

Enable or retain strict settings including:

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

Do not weaken compiler settings to silence implementation errors without an ADR.

## 3. Types

- No `any`
- Use `unknown` at untrusted boundaries
- Narrow persisted JSON before use
- Prefer readonly inputs and fields in domain contracts
- Prefer string-literal unions/discriminated unions to numeric enums
- Use branded string types for domain IDs when implemented
- Use `import type` and `export type` for type-only symbols
- Public APIs require explicit return types
- Exhaustive switches call an `assertNever` helper

## 4. Immutability

Domain operations return new state and never mutate the input state.

Forbidden examples:

```ts
state.players[id].resources.wood += 1;
state.board.edgeOccupancy[edgeId] = road;
```

Tests may freeze fixtures to detect mutation. Do not introduce Immer until a task demonstrates a real need and documents the dependency.

## 5. Side effects

The pure game layer must not directly use:

```text
window
document
localStorage
indexedDB
fetch
WebSocket
setTimeout
Date.now
crypto.randomUUID
Math.random
console as game behaviour
```

IDs, randomness, and external timestamps enter through explicit boundary services or command metadata.

## 6. File and export style

- Use kebab-case filenames
- Prefer named exports
- Keep one clear responsibility per module
- Keep domain types close to their domain
- Avoid generic `utils.ts` dumping grounds
- Avoid index-barrel files that create circular dependencies; add only when justified
- Do not create a giant `GamePage.tsx` or `game-engine.ts` containing all behaviour

## 7. React and MUI

- UI reads from selectors/store snapshots
- UI submits commands through controllers/gateway
- UI never calculates authoritative resource changes or legality
- Use MUI theme tokens instead of scattered literal colors/spacing
- Use Roboto weights 300/400/500/700 through Fontsource
- Keep board rendering in SVG components
- Use semantic MUI controls for dialogs and forms
- Do not make color the only ownership or legality indicator
- Include accessible names for icon-only buttons

## 8. State stores

- Store only application/session or transient UI state
- Do not mirror authoritative `GameState` fields into unrelated writable slices
- Use focused selectors to limit rerenders
- Keep gateway subscriptions outside presentation components where practical

## 9. Errors

Expected rule failure:

```text
EngineResult { ok: false, violation }
```

Unexpected invariant failure:

```text
throw Error with actionable diagnostic
```

Never catch and silently ignore an error. User-facing errors are translated from stable codes, not raw stack traces.

## 10. Tests

### Unit tests

- Place beside pure modules as `*.test.ts` when focused
- Use deterministic fixtures
- Test results, state, events, and non-mutation

### Component tests

- Prefer roles, names, and user interactions
- Avoid testing MUI implementation details
- Use `@testing-library/user-event`

### Integration tests

- Place cross-module tests under `tests/integration`
- Test command-to-state/event flows

### Replay tests

- Place deterministic command fixtures under `tests/replays`
- Store schema/version and expected state hash

### E2E

- Playwright is added only when a later task needs end-to-end flows

## 11. Required scripts

After Task 00 the repository should expose:

```text
npm run dev
npm run typecheck
npm run lint
npm run test
npm run test:watch
npm run build
npm run preview
npm run check
```

`check` runs typecheck, lint, tests, and production build.

## 12. Documentation and ADRs

Update documentation when a public contract, frozen rule, architecture boundary, or persistence format changes.

An ADR is required for changes such as:

- Replacing the game architecture
- Changing ruleset behaviour
- Adding a backend to V1
- Allowing AI hidden-state access
- Replacing seeded RNG algorithm
- Adding a major state-management or immutable-state dependency
- Changing board topology representation

## 13. Dependency policy

Before adding a package, report:

1. Problem it solves
2. Why existing platform/project code is insufficient
3. Runtime or development-only status
4. Bundle/security/maintenance implications where material

Task 00 approved dependencies are limited to the scaffold and the explicitly listed MUI, Roboto, Zustand, Vitest, jsdom, and Testing Library packages.
