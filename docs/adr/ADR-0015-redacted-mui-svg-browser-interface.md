# ADR-0015: Redacted MUI and Raw SVG Browser Interface

- Status: Accepted
- Date: 2026-09-03
- Decision owners: Project owner and architecture assistant

## Context

Stage 16 must replace the static board preview with a complete playable browser interface without
duplicating legality, exposing locally available hidden state, or coupling the UI to the local
engine implementation.

## Decision

- Keep a two-screen presentation state rather than add a routing dependency.
- Inject and program only against `GameGateway`; subscribe through the redacted session store and
  keep transient build/dialog/selection state in the separate UI store.
- Centralize board command construction in a UI controller that accepts `PlayerView` and exact
  projected target IDs. Components do not derive graph or resource legality.
- Use MUI for application layout, controls, panels, feedback, and accessible dialogs.
- Use raw SVG for the board, preserving the accepted topology coordinate projection and drawing
  original terrain, token, port, piece, robber, and legal-target visuals.
- Give SVG targets accessible names, keyboard activation, and visible focus. Support reduced motion,
  wrapping controls, and a no-horizontal-overflow single-column layout at 480px.
- Build event log text only from redacted `PlayerEventView` and player names already present in the
  viewer's projection.
- Materialize Web Crypto seed bytes as a displayed application seed before starting the engine;
  inject seed factories in tests.

## Consequences

### Positive

- All V1 commands and pending decisions are reachable without granting React authority.
- A future gateway can replace the local implementation without replacing board interaction flows.
- Hidden opponent cards, deck order, RNG state, and authoritative saves never enter React props or
  the DOM.
- The board remains crisp, responsive, and operable without an image-asset dependency.

### Negative

- The complete decision surface creates several focused dialog components.
- The single-column tablet/mobile layout is vertically long by design.
- The V1 board uses static fit-to-view scaling rather than pan/zoom gestures.

## Alternatives considered

### Copy authoritative state into React or Zustand

Rejected because it would create a second mutable authority and expose hidden local information.

### Recompute legal board targets in SVG components

Rejected because UI legality would drift from the engine.

### Use a canvas or official game artwork

Rejected because raw SVG provides accessible target structure and the release requires original
visuals without protected presentation assets.
