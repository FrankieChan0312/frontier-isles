# ADR-0004: Deterministic Game Creation and Initial Setup

- Status: Accepted
- Date: 2026-09-02
- Decision owners: Project owner and architecture assistant

## Context

The first authoritative `GameState` needs a reproducible board, starting player, development deck,
and complete four-player setup sequence without prematurely creating the normal-turn engine.
Creation and setup must preserve Task 04 random parity and Task 01 command/event contracts.

## Decision

- `createGame(config, seed)` validates the exact four-player configuration at runtime and preserves
  accepted strings unchanged.
- Random operations occur in frozen order: generate the board, draw one first-player input index
  and rotate the clockwise seating tuple, then shuffle the 25-card development deck.
- The shuffled development deck uses array index `0` as its top card.
- Setup `placementIndex` is local to each round (`0..3`), producing actor order
  `A, B, C, D, D, C, B, A`.
- Each second settlement grants resources immediately inside its successful settlement command,
  before the corresponding road. Granted producing tiles emit one event each in sorted tile order.
- Expose only a setup-command executor for initial settlements and roads. A later task will compose
  it into the complete command router.

## Consequences

### Positive

- Equal configuration and seed produce the same board, rotated order, deck, and initial state.
- Setup replay uses immutable state versions and consumes no random draws.
- Starting-resource bank transfers and events are committed atomically with the second settlement.
- The fourth player naturally acts twice at the snake-order midpoint without special UI state.

### Negative

- Changing creation draw order, deck source order, or setup-index semantics breaks golden replays.
- Normal-turn commands remain intentionally unavailable through this narrow executor.
- Setup integrity validation adds explicit checks before every placement command.

## Alternatives considered

### Shuffle all players

Rejected because the rules choose one starter while preserving clockwise seating order.

### Grant resources after the setup road

Rejected because the frozen rules grant resources immediately upon the second settlement.

### Implement the complete game engine now

Rejected because normal turns, dice, robber, trade, development cards, awards, and victory require
later dedicated rule tasks.
