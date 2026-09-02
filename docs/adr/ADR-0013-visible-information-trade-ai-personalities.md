# ADR-0013: Visible-Information Trade AI and Personalities

- Status: Accepted
- Date: 2026-09-02
- Decision owners: Project owner and architecture assistant

## Context

Stage 13 can complete games but deliberately rejects every domestic offer. V1 requires plausible
initiation, acceptance, rejection, and one counteroffer between any Human/AI combination while
preserving the direct negotiation contract and preventing local AI from reading opponent hands.
Three named personalities must vary behavior without varying legality.

## Decision

- Add Merchant, Builder, and Sentinel as explicit weight/threshold profiles used by one
  `PersonalityAiAgent` around the accepted core agent.
- Evaluate offers solely from `PlayerView`: exact self cards, visible production, topology scarcity,
  controlled ports, self seven risk, public opponent scores/card counts, public awards, and visible
  network pressure. Never inspect or estimate from authoritative opponent composition.
- Score incoming value minus outgoing value plus build unlock/lock, port/scarcity, hand-risk, and
  personality adjustments, less estimated opponent gain multiplied by public threat.
- Reject ordinary trades with a visible nine-point leader unless compensation is exceptional.
- Generate a counter only at engine counter depth zero. Preserve stable parties, add the minimum one
  requested card, validate only the counter author's outgoing cards, and derive the child trade ID
  deterministically.
- Initiate bounded one-for-one offers toward a high marginal-value resource using a visible low-threat
  counterparty. Allow at most two Merchant attempts and one Builder/Sentinel attempt per turn; never
  repeat identical terms.
- Derive trade IDs from turn number, actor, attempt, and role suffix. No random, UUID, or clock input
  is used.

## Consequences

### Positive

- AI-to-AI and AI-to-Human trades use the same pending decision and command validation as Human
  offers.
- Publicly identical views produce identical decisions regardless of hidden opponent hands.
- Profiles create inspectable behavior differences without rule forks.
- Counter depth, attempt budgets, and term history make negotiation finite.

### Negative

- Opponent benefit is necessarily an estimate from public production and threat, not a prediction of
  the opponent's exact hand.
- V1 initiation searches bounded one-card terms rather than arbitrary multi-card combinations.
- Deterministic trade IDs are unique within the local turn/attempt policy, not globally random IDs.

## Alternatives considered

### Inspect opponent hands because the game is local

Rejected because it would cheat and violate the frozen future-network boundary.

### Enumerate every possible resource bundle

Rejected because the combinatorial search is unnecessary for V1 and would make browser turns less
responsive.

### Separate AI engines per personality

Rejected because profiles must adjust strategy weights rather than fork game rules or command paths.
