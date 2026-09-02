# ADR-0002: Flat-Top Raw-SVG Board Rendering

- Status: Accepted
- Date: 2026-09-02
- Decision owners: Project owner and architecture assistant

## Context

The accepted standard-board topology contains stable graph identities and exact integer geometry,
but no screen coordinates. The first board preview needs to scale responsively, remain accessible,
and preserve the architecture boundary between pure game data and presentation.

## Decision

- Render the board with browser-native raw SVG rather than Canvas, WebGL, a game engine, or UI box
  elements.
- Use a flat-top hex orientation with one pure UI-layer projection from accepted axial and scaled
  integer-corner coordinates.
- Keep all SVG coordinates, polygon strings, port marker positions, and viewport bounds under
  `src/ui/board/**`; `src/game/**` remains renderer-independent.
- Treat branded topology IDs as opaque stable keys. Pair accepted cyclic tile vertex IDs with
  calculated integer corners instead of parsing coordinate data from ID strings.
- Compute one padded `viewBox` from tile points and complete outward port marker rectangles, then
  use `preserveAspectRatio="xMidYMid meet"` for responsive scaling.
- Limit Task 03 to neutral topology presentation, visible port labels, accessibility metadata, and
  an optional debug overlay. It introduces no terrain semantics or interaction.

## Consequences

### Positive

- Shared topology vertices project to identical SVG positions without changing domain contracts.
- The board scales at narrow and wide widths without breakpoint-specific geometry.
- Native SVG title/description metadata and inspectable entity layers support accessibility and
  focused tests.
- Future rendering layers can reuse stable IDs and layout records without storing pixels in game
  state.

### Negative

- The renderer performs a deterministic projection whenever the component renders.
- Port marker rectangles remain axis-aligned rather than rotating with coastal edges.
- Interaction, terrain, pieces, and gameplay presentation require later scoped tasks.

## Alternatives considered

### Canvas or WebGL

Rejected because the current static, turn-based board benefits more from SVG responsiveness,
accessibility, and direct entity inspection than from a rasterized scene.

### MUI or HTML boxes for board entities

Rejected because shared edges and vertices are naturally represented in one SVG coordinate space.

### Store screen coordinates in topology contracts

Rejected because it would couple `src/game/**` to one presentation and violate the accepted
renderer-independent board model.
