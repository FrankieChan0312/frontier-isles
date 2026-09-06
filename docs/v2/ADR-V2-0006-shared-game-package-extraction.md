# ADR-V2-0006: Shared Game Package Extraction

- Status: Accepted
- Date: 2026-09-06
- Scope: V2-05

## Context

The accepted engine and AI must run in both the local browser gateway and the forthcoming
authoritative server. Copying them would create independent rule implementations. Their existing
modules already separate deterministic domain behavior from browser orchestration and storage.

## Decision

- Move the accepted `src/game` tree to `packages/game-core/src` and `src/ai` to
  `packages/game-ai/src`, preserving algorithms, fixtures, tests, and relative module structure.
- Use explicit package subpath imports. Export compiled ESM and declarations from workspace
  builds; no compatibility re-exports or second engine/AI copies remain under root `src`.
- Keep dependency direction `game-ai -> game-core`. Core has no runtime dependencies. AI has
  only the local core dependency. React, MUI, Zustand, storage, transport, Room, and application
  dependencies are forbidden in both domain packages.
- Preserve the portable simulation harnesses with AI. Command-line runners remain separate
  modules and are never imported by the browser or the agent decision implementation.
- Compile with strict NodeNext ESM, no DOM library, explicit `.ts` relative imports rewritten to
  `.js` at build time, and independent typecheck/lint/test/build commands. Tests run in Node.
- Build packages in dependency order before frontend/server consumers. Keep all accepted tests
  in the aggregate root test command, with package suites reported separately.
- Add architecture tests for dependency direction, browser/entropy exclusions, one authoritative
  implementation, and package runtime resolution.

## Consequences

LocalGameGateway still owns Single Player authority and persistence. Game rules, seeded draws,
controller policy, and PlayerView behavior do not change in this task. Online creation/execution
begins only in V2-06. The repository gains two local workspace dependencies and no external
runtime package. Generated files remain ignored and cannot substitute for a passing source build.
