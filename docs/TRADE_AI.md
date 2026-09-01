# Trade AI Specification

## 1. Objective

Trade AI should appear to understand current needs, resource scarcity, ports, immediate build opportunities, and opponent threat. It must not merely compare fixed card prices, and it must not inspect hidden opponent hands.

## 2. Offer contract

Conceptual model:

```ts
export interface TradeOffer {
  readonly tradeId: TradeId;
  readonly initiatorId: PlayerId;
  readonly counterpartyId: PlayerId;
  readonly initiatorGives: ResourceBag;
  readonly counterpartyGives: ResourceBag;
  readonly parentTradeId: TradeId | null;
}
```

Validation requires:

- Initiator is the current player
- Both parties are different valid players
- Both sides give at least one card
- Both parties own the offered cards when completing the trade
- Same-resource disguised gifts are rejected
- Only resources are included
- Trade is allowed in the current phase

## 3. Dynamic marginal resource value

Each resource receives a value for the evaluating AI in the current state.

Inputs include:

- Shortage toward active goals
- Whether one card unlocks an immediate build
- Expected personal production rate
- Global board scarcity visible from topology
- Existing ports
- Excess duplicates
- Hand size and seven risk
- Stage of game
- Award strategy
- Bank availability for maritime alternatives

The same Brick can therefore be high value early and low value after expansion is complete.

## 4. Base evaluation

```text
tradeScore =
    incomingResourceValue
  - outgoingResourceValue
  + immediateBuildUnlockBonus
  + portSynergyBonus
  + handRiskAdjustment
  + scarcityAdjustment
  - estimatedOpponentGain * opponentThreatWeight
  - victoryRisk
  + personalityAdjustment
```

All terms and weights must be inspectable in diagnostics/tests. Do not hide the decision in a single opaque function.

## 5. Own-side value

### Incoming value

Evaluate every received card at its marginal value after the trade, not only before it.

### Outgoing value

Penalize giving away cards that:

- Are required for the current goal
- Would break an immediately affordable build
- Have strong port conversion value
- Are globally scarce

Discount cards that are materially overstocked and weak for current plans.

### Build unlock bonus

Examples:

```text
Trade immediately enables settlement
Trade immediately enables city
Trade immediately enables critical connecting road
Trade immediately enables development-card purchase
```

The bonus should reflect the quality of the actual available placement/action, not just possession of a recipe.

## 6. Opponent-benefit estimate

The AI estimates, rather than reads, opponent benefit using public information:

- Public VP and awards
- Visible road/building network
- Resource-card count
- Recently observed production
- Publicly spent resources
- Known trade contents
- Available legal placements
- Whether the requested card plausibly unlocks a build
- Whether the opponent is current leader or near 10 points

Uncertainty should reduce confidence, not justify hidden-state access.

## 7. Threat weighting

Opponent threat can include:

```text
public victory points
estimated hidden-point range
settlement/city production
Longest Road proximity
Largest Army proximity
card-count strength
immediate winning possibility
```

A trade that is good in isolation may be rejected if it can plausibly enable an opponent's victory.

## 8. Response policy

```ts
export type TradeDecision =
  | { readonly type: "ACCEPT"; readonly score: number }
  | {
      readonly type: "REJECT";
      readonly score: number;
      readonly reasonCode: TradeReasonCode;
    }
  | {
      readonly type: "COUNTER";
      readonly score: number;
      readonly counterOffer: TradeOffer;
    };
```

Decision thresholds are profile-driven. Merchant may accept a smaller positive margin; Sentinel demands a larger margin from a leader.

User-facing reason codes should be short and non-revealing, for example:

```text
NOT_ENOUGH_VALUE
NEED_OFFERED_RESOURCE
HELPS_LEADER_TOO_MUCH
PREFER_MARITIME_TRADE
COUNTER_AVAILABLE
```

Do not expose hidden AI calculations or inferred hand estimates in the normal UI.

## 9. Counter-offer generation

When an offer is close but unacceptable:

1. Preserve the counterparty's requested resource when possible
2. Identify the smallest additional concession that crosses the threshold
3. Search bounded one-card and two-card modifications
4. Reject candidates that give away critical scarce cards
5. Reject candidates that create an immediate unacceptable opponent threat
6. Return the best valid counter, not an arbitrary greedy demand

V1 counter depth is one per counterparty per initiated negotiation.

## 10. AI-initiated offers

An AI initiates a trade only when:

- It has a strategic target resource
- Maritime trade is worse or unavailable
- The expected value after opponent cost is positive
- The offer does not exceed the turn offer budget

Candidate generation:

1. Select desired resource(s)
2. Rank expendable resources
3. Generate bounded 1-for-1, 2-for-1, and selected mixed offers
4. Estimate which opponent may plausibly accept from public information
5. Score own gain minus opponent benefit
6. Submit the best offer above the initiation threshold

Do not enumerate huge combinatorial bundles.

## 11. Human interaction

Human offer to AI:

```text
Human submits offer
-> engine validates structure/ownership/phase
-> AI evaluates redacted view
-> ACCEPT / REJECT / COUNTER
-> human sees result in MUI dialog
```

AI offer to human pauses the AI turn using a pending decision until the human accepts, rejects, or counters within the supported depth.

AI-to-AI offers may resolve automatically, but commands/events remain visible in the game log without exposing private hand contents beyond the completed trade.

## 12. Anti-exploit behaviour

The AI should resist:

- Repeatedly probing identical rejected offers
- Helping a player at 9 public points without overwhelming compensation
- Trading away a card that immediately enables its own planned build to disappear
- Accepting nominally positive trades when maritime trade is clearly superior
- Paying more cards than configured limits without an exceptional immediate unlock
- Infinite counter-offer loops

## 13. Test scenarios

Required trade tests later include:

1. Accept 1:1 when received card completes a strong settlement and outgoing card is surplus
2. Reject the same offer when outgoing card is critical for an immediate city
3. Reject a superficially profitable offer that plausibly lets a 9-point opponent win
4. Prefer 2:1 owned port over an expensive domestic offer
5. Generate a minimal counter rather than a random 2:1 demand
6. Different profiles make different but valid decisions
7. Hidden opponent composition cannot affect result when public view is identical
8. Same state/profile/seed gives deterministic result
9. Rejected repeated offer does not loop
10. Trade completion revalidates both hands because state may have changed
