# ADR-0016: Release Verification and Static Delivery

- Status: Accepted
- Date: 2026-09-03
- Decision owners: Project owner and architecture assistant

## Context

Stage 17 must prove full-game progress beyond ordinary unit tests, exercise release paths in a real
browser, and leave a deploy-ready artifact without adding production testing controls or expanding
V1 into a hosted service.

## Decision

- Keep the 100-game release corpus separate from Vitest and run fixed `V1-RELEASE-NNN` seeds through
  the existing mixed-profile simulation boundary.
- Produce an ordered summary and deterministic hash while retaining per-game summaries and the
  existing bounded diagnostic trace on failure.
- Use Playwright Chromium for five serial E2E flows. Construct long-path states with accepted engine
  test helpers, validate and serialize them with the production save format, and inject only the
  resulting save document through browser storage.
- Compile Playwright configuration and fixtures under a separate strict TypeScript project included
  by the repository typecheck.
- Keep Playwright and its browser binary out of runtime dependencies and production bundles.
- Deliver Vite's `dist/` as a static site with explicit security/cache headers. Do not deploy unless
  an authorized target and credentials already exist.
- Document the bundle-size advisory instead of adding speculative splitting or dependencies without
  a measured user-facing benefit.

## Consequences

### Positive

- Repeatable simulation proves legal wins, bounded progress, deterministic summaries, and invariants
  across materially more games than the ordinary suite.
- Browser tests cover every required release workflow through the public UI and persistence entry
  point without weakening production architecture.
- Clean-install and static-host instructions are reproducible and require no secret configuration.

### Negative

- The 100-game corpus is CPU-intensive and intentionally not part of `npm run check`.
- E2E requires a one-time Playwright Chromium download and does not provide a multi-browser matrix.
- The offline engine and UI framework remain in one entry chunk and trigger Vite's size advisory.

## Alternatives considered

### Add production fixture or debug APIs

Rejected because they would expose hidden state and create a command path outside normal validation.

### Put 100 simulations inside the ordinary test suite

Rejected because it would make normal development feedback disproportionately slow.

### Add a backend or hosting SDK

Rejected because V1 is fully static and no deployment service or credentials were authorized.
