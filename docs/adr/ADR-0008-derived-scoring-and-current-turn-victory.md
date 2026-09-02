# ADR-0008: Derived Scoring and Current-Turn Victory

- Status: Accepted
- Date: 2026-09-02
- Decision owners: Project owner and architecture assistant

## Context

Awards and victory depend on authoritative board occupancy, played Knights, development-card
status, and whose turn is active. Storing route lengths or score totals would duplicate facts and
could drift after a settlement interrupts a road or a hidden Victory Point card is revealed.

## Decision

- Derive Longest Road by exhaustively searching edge trails in the owner's occupied subgraph. An
  edge is used at most once; vertices may be revisited through unused edges. An opponent building
  permits arrival on its incident road but stops traversal through that vertex.
- Require five roads for Longest Road and three played Knights for Largest Army. A qualifying
  current holder retains a tie at the maximum; otherwise only a unique qualifying maximum holds
  the award.
- Derive public and actual scores from buildings, current awards, and development cards. In-hand
  Victory Point cards are hidden from public score but count toward actual score; revealed cards
  count in both.
- Resolve victory only for the current player at 10 or more actual points. Reveal all of that
  winner's in-hand Victory Point cards, set `GAME_OVER`, and emit `GAME_WON` last.
- Use a scoring-reconciliation boundary that changes neither `stateVersion` nor seeded random
  state. The paid-building and end-turn command executors remain responsible for their single
  version increment.
- Reconcile both awards after successful paid building. At `END_TURN`, resolve the newly current
  player's victory without recalculating unchanged awards.

## Consequences

### Positive

- Score and route facts cannot become stale duplicated fields.
- Branches, loops, disconnected roads, and settlement interruption use one deterministic graph
  definition.
- Command event order is stable: build, award changes, then victory; or turn ended, turn started,
  then victory.
- Future development-card execution can reuse the same no-version/no-random reconciliation
  boundary.

### Negative

- Exhaustive trail search is exponential in the owner's road count, although the standard limit
  of 15 roads keeps the bounded search practical.
- Persisted states with impossible non-null holders or inconsistent winner state are rejected and
  require explicit migration or recovery.

## Alternatives considered

### Store score and Longest Road length in authoritative state

Rejected because those values are fully derivable and would need error-prone synchronization after
every occupancy, award, and card-status change.

### Award a tied challenger

Rejected because the frozen rules retain a qualifying current holder; without a holder, a tied
qualifying maximum remains unheld.

### Resolve any player reaching 10 immediately

Rejected because victory is established only during that player's own turn, including the
turn-start boundary before rolling.
