# ADR-0009: Authoritative Development-Card Lifecycle

- Status: Accepted
- Date: 2026-09-02
- Decision owners: Project owner and architecture assistant

## Context

Development cards cross several existing boundaries: private inventory, pending player choices,
road placement, robber movement, awards, and victory. Removing played cards or resolving choices
outside authoritative state would weaken card conservation and deterministic replay. The Task 01
contracts already freeze the card statuses, pending decisions, commands, and event union.

## Decision

- Keep all 25 standard card identities exactly once across the bank deck and owned collections.
  Buying converts the top definition into an owned record; playing never removes that record.
- Mark non-Victory-Point action cards `PLAYED`. Keep Victory Point cards `IN_HAND` while hidden and
  mark all of a winner's hidden Victory Point cards `REVEALED` through the scoring resolver.
- Represent Invention, Monopoly, Road Building, and Knight continuation with the accepted typed
  pending decisions. Pending data identifies the acting player and exact played card.
- Route Road Building placements through `BUILD_ROAD` in `FREE_ROAD_PLACEMENT`. Reuse ordinary road
  target, connectivity, blocking, and piece-limit rules while deliberately omitting payment.
- Reconcile awards and current-player victory after purchase and free-road placement. Reconcile
  Largest Army on Knight play, then defer any resulting victory until Task 07 completes robber
  movement and optional theft.
- Permit effect-resolution commands to emit zero events. Task 01 froze the exact event union, and
  deterministic state transitions plus version increments are sufficient for these resolutions.

## Consequences

### Positive

- Card identity, status, and played-Knight counts are independently auditable invariants.
- Replays preserve action-card history and hidden/revealed Victory Point semantics.
- Card effects reuse authoritative road, robber, resource, and scoring rules rather than creating
  parallel implementations.
- Pending choices remain serializable and can later be projected safely through a player view.

### Negative

- Completed action cards remain in player collections and must be filtered by status where needed.
- Knight victory completion spans the Task 10 play boundary and the Task 07 robber boundary.
- Some successful commands have an empty event list, so consumers must also observe state version
  and pending-decision changes.

## Alternatives considered

### Remove a card when it is played

Rejected because it loses authoritative identity and makes conservation, replay, and played-Knight
validation weaker.

### Add card-specific road or resource-choice events

Rejected because Task 01 froze the public event union and these deterministic state changes do not
require additional discriminants.

### Implement a separate free-road command

Rejected because the accepted `BUILD_ROAD` command can reuse the normal placement boundary while
the phase and pending decision distinguish the no-payment source.
