# ADR-0010: Authoritative Domestic and Maritime Trading

- Status: Accepted
- Date: 2026-09-02
- Decision owners: Project owner and architecture assistant

## Context

Domestic negotiation must permit a non-current player to respond without exposing that player's
private hand through proposal validation. Maritime legality depends on current board occupancy and
port kinds, while the accepted state schema intentionally stores neither port ownership nor trade
history. Task 01 already freezes the trade commands, offer shape, pending decision, events, and
violations.

## Decision

- Use a direct negotiation chain with the current player as stable initiator and exactly one other
  player as stable counterparty. Support an initial proposal followed by accept, reject, or one
  formal counter; countered terms may only be accepted or rejected.
- Keep current terms in `RESPOND_TO_TRADE`. Trade IDs are supplied by commands and validated only
  for active parent/child lineage. Do not generate IDs or add authoritative trade history.
- Do not reserve or escrow resources. A proposal validates only the initiator's outgoing bundle;
  a counter validates only the counterparty author's outgoing bundle. Acceptance revalidates both
  sides and performs one atomic exchange.
- Derive controlled ports from buildings on the two authoritative endpoints of each port edge.
  Derive the best ratio for the supplied give resource as matching 2:1, otherwise generic 3:1,
  otherwise the standard 4:1 fallback.
- Cache neither controlled ports nor ratios in player/game state, and accept no client-supplied
  ratio. Trading consumes no random draw.

## Consequences

### Positive

- Offer submission cannot probe the non-proposing player's private resource composition.
- Stable party fields and one counter keep the pending protocol finite and serializable.
- Acceptance cannot partially transfer resources or rely on stale affordability.
- A newly built port is available immediately because every maritime command reads current board
  occupancy.
- Deterministic trade commands require no hidden entropy, clock, ID service, or cached derived data.

### Negative

- A valid offer can remain pending even when the responder cannot currently satisfy it.
- Consumers must retain the pending decision after an unavailable acceptance and present another
  legal response.
- Longer negotiation chains, withdrawals, timeouts, and trade history are deliberately unsupported.

## Alternatives considered

### Validate both hands on proposal or counter

Rejected because differing failures would expose information about the non-proposing party's
private hand.

### Reserve resources while an offer is pending

Rejected because pending decisions already block other commands, and escrow would add duplicated
state and new recovery rules.

### Store port ownership or a current ratio on each player

Rejected because both values are fully derived from topology, occupancy, port kind, and the give
resource and could become stale after building changes.
