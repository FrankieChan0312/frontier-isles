# ADR-0005: Deterministic Dice, Production, and Turn Lifecycle

- Status: Accepted
- Date: 2026-09-02
- Decision owners: Project owner and architecture assistant

## Context

The first repeatable normal-turn slice must consume the accepted seeded random cursor, allocate
resources from authoritative board occupancy, handle finite bank supply, and advance clockwise
turns without prematurely implementing the full command engine or seven-resolution workflow.

## Decision

- Roll two ordered dice by calling the accepted bounded RNG once for the first die and once for the
  second, threading the immutable successor state through both calls.
- Derive production only from unblocked authoritative tiles and adjacent buildings. Process tiles
  by ascending axial `(q, r)` and players by accepted `playerOrder`.
- Aggregate multiple buildings owned by the same player on the same tile into one allocation. Keep
  allocations from different tiles separate, even for the same player and resource.
- Decide bank sufficiency independently per resource across the entire roll. A shortage involving
  multiple entitled players grants none of that resource; a single entitled player receives all
  remaining supply in tile order. Emit blocked events in frozen resource order.
- Expose a narrow lifecycle executor for `ROLL_DICE` and `END_TURN`, alongside the accepted setup
  executor, rather than a generic router that would misrepresent unimplemented commands.
- Treat `turnNumber` as a global one-based player-turn sequence and increment it once on every
  successful clockwise `END_TURN`.
- A rolled seven creates the accepted `DISCARD_RESOURCES` or `MOVE_ROBBER` pending decision only.
  Task 07 owns discard execution, robber movement, target selection, theft, and completion of the
  seven-resolution sequence.

## Consequences

### Positive

- Equal state and command sequences reproduce ordered dice, production events, bank transfers, and
  final random cursors exactly.
- Resource allocation and bank shortages do not depend on object insertion order or UI geometry.
- Expected command failures remain data while corrupted authoritative state fails immediately.
- Later command families can compose focused executors without widening accepted public contracts.

### Negative

- A rolled seven intentionally pauses before the Action phase until Task 07 supplies its commands.
- Production requires explicit candidate grouping before any transfer can be committed.
- Changing ordering or shortage grouping would invalidate golden replays and cross-language parity.

## Alternatives considered

### Injected or forced dice values

Rejected because an alternate roll path would bypass authoritative random-state accounting.

### Allocate tile by tile directly from the bank

Rejected because the shortage rule must consider all demand for one resource across the complete
roll before granting any multi-player allocation.

### Complete generic command router

Rejected because discard, robber, build, trade, and development-card commands remain deliberately
unimplemented and must not return misleading lifecycle violations.
