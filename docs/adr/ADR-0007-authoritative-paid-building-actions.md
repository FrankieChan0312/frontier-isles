# ADR-0007: Authoritative Paid Building Actions

- Status: Accepted
- Date: 2026-09-02
- Decision owners: Project owner and architecture assistant

## Context

Normal Action turns need paid road, settlement, and city commands that compose with the accepted
turn and robber workflows. Legality depends on authoritative topology, occupancy, hands, bank
supply, and finite physical pieces. Keeping any of those decisions in UI state would create a
second rule authority and make deterministic replay unreliable.

## Decision

- Keep paid-build validation and execution in the pure TypeScript game layer behind a narrow
  executor for `BUILD_ROAD`, `BUILD_SETTLEMENT`, and `UPGRADE_CITY`.
- Validate topology, connectivity, distance, ownership, and physical-piece availability before
  affordability, then atomically transfer the exact cost from the acting player's hand to the
  bank in the same successful state transition.
- Derive active road, settlement, and city counts from board occupancy. Do not duplicate piece
  counters in `PlayerState` or `GameState`; replacing a settlement with a city naturally releases
  the settlement piece.
- Treat an opponent building as a road-network interruption at its vertex. A road may still be
  placed when its other endpoint independently supplies a legal connection.
- Consume no randomness and preserve the current Action turn after every successful paid build.
- Defer Longest Road, awards, score derivation, winner assignment, and victory events to dedicated
  later tasks.

## Consequences

### Positive

- Human and future AI actors receive identical authoritative legality and payment behavior.
- Resource conservation, piece limits, and immutable occupancy changes are testable without UI or
  browser dependencies.
- City replacement and opponent road interruption follow directly from the current board graph.
- The narrow executor composes with normal and resolved-seven Action states without pretending to
  route unimplemented commands.

### Negative

- Build commands do not yet update Longest Road or victory state.
- Callers must continue composing several focused executors until the complete command router is
  implemented.
- Present-state integrity checks cannot reconstruct historical placement legality without an event
  history, which remains intentionally outside authoritative state.

## Alternatives considered

### Store remaining piece counts on each player

Rejected because board occupancy already contains the authoritative facts and duplicated counters
could drift after city upgrades or corrupted loads.

### Deduct resources before validating placement

Rejected because ordinary illegal targets must be atomic failures with no partial payment.

### Recalculate awards and victory after every build now

Rejected because Longest Road graph traversal, scoring, and winner resolution require dedicated
rules and tests beyond the paid-building scope.
