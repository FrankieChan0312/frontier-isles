# AGENTS.md

This file governs all coding agents working in this repository.

## Mandatory reading order

Before changing code, read:

1. `docs/PRODUCT_SCOPE.md`
2. `docs/GAME_RULES.md`
3. `docs/ARCHITECTURE.md`
4. The task file under `tasks/`
5. Any domain-specific document referenced by that task
6. Relevant accepted ADRs under `docs/adr/`

Do not infer missing rules from memory. If a required behaviour is absent or contradictory, stop that part of the implementation, document the ambiguity, and do not silently invent a rule.

## Frozen architecture rules

1. `src/game/**` is a pure TypeScript domain and rules layer.
2. `src/game/**` must not import React, MUI, Zustand, browser storage, timers, networking, UI modules, application stores, or AI modules.
3. React components must not mutate authoritative game state.
4. UI components must not decide game legality independently.
5. Human players and AI players submit the same `GameCommand` contracts.
6. UI depends on `GameGateway`, not directly on `LocalGameEngine`.
7. AI receives a redacted `PlayerView`, never unrestricted opponent private state.
8. All randomness flows through the seeded random abstraction.
9. Never call `Math.random()` in application or game code.
10. Never depend on wall-clock time inside the deterministic game engine.
11. Treat ordinary illegal moves as `RuleViolation` results, not system exceptions.
12. Do not mutate an existing `GameState`; return a new state.
13. Public contracts use serializable data only.
14. Prefer discriminated unions and string literals over TypeScript numeric enums.
15. Do not add a backend, database, login, router, WebSocket, game engine, AI logic, or board logic unless the active task explicitly requests it.

## Scope discipline

V2-05 location update: under accepted `docs/v2/ADR-V2-0006-shared-game-package-extraction.md`,
`src/game/**` moved to `packages/game-core/src/**` and `src/ai/**` moved to
`packages/game-ai/src/**`. Apply every domain/AI restriction above to those package locations.
Core must not depend on AI; AI depends only on core. Historical task paths remain documentary.

- Implement only the active task.
- Do not anticipate later tasks by adding speculative abstractions.
- Do not rename frozen identifiers without an accepted ADR.
- Do not add dependencies without explaining the concrete need in the completion report.
- Do not remove or rewrite documentation merely to make an implementation easier.
- Do not copy official CATAN artwork, logos, rulebook text, card images, or branded presentation.

## TypeScript standards

- Strict TypeScript is mandatory.
- No `any`. Use `unknown` and narrow it.
- Use `import type` for type-only imports.
- Public functions and public object contracts require explicit types.
- Exhaustively handle discriminated unions.
- Avoid non-null assertions unless an invariant is proved immediately beside the assertion.
- Prefer immutable readonly inputs in domain functions.
- Keep side effects at application/infrastructure boundaries.

## Testing rules

Every task must add or update tests for its behaviour.

Before claiming completion, run:

```text
npm run typecheck
npm run lint
npm run test
npm run build
```

If the repository defines `npm run check`, run that as the final aggregate command too.

A task is not complete when:

- tests are skipped without an explicit task requirement;
- TypeScript errors remain;
- lint warnings are ignored;
- generated files hide a failing source build;
- behaviour is implemented only in UI without domain validation;
- the completion report omits failures or limitations.

## Required completion report

At the end of each task, report:

1. Files created or changed
2. Behaviour implemented
3. Dependencies added and why
4. Commands run and their exact result
5. Tests added
6. Known limitations or unresolved questions
7. Confirmation that no unrelated future feature was implemented

Do not create a Git commit unless the user explicitly requests it.
