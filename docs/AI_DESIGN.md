# AI Design

## 1. V1 AI objective

V1 does not attempt machine learning or human-language reasoning. It implements a deterministic heuristic/utility agent that can complete every required decision, obey hidden-information rules, and produce strategically plausible games.

The first milestone is one correct **Normal** decision engine. Personality weights create three opponents. Easy/Hard levels come later.

## 2. Non-cheating boundary

An AI receives the same type of redacted `PlayerView` that a network client could receive.

It may know:

- Its own resources and development cards
- Board state and public buildings/roads
- Public victory points
- Opponent resource-card counts
- Opponent development-card counts
- Publicly played cards and Knights
- Public production/trade/build events
- Its own inferred memory from public history

It may not directly inspect:

- Exact opponent resource composition
- Hidden opponent development cards
- Hidden opponent victory points
- Future random values
- Unshuffled deck order

## 3. Common command path

```text
Human interaction -> GameCommand -> engine validation
AI decision       -> GameCommand -> engine validation
```

An AI cannot directly edit resources, occupancy, score, deck, phase, or random state.

## 4. Agent interface

```ts
export interface AiAgent {
  chooseNextCommand(
    view: PlayerView,
    context: AiContext,
  ): Promise<GameCommand>;

  evaluateTrade(
    view: PlayerView,
    offer: TradeOffer,
    context: AiContext,
  ): Promise<TradeDecision>;
}
```

The interface returns `Promise` from the beginning so expensive future logic can move to a Web Worker without changing callers.

## 5. Decision pipeline

For each decision:

1. Observe redacted view
2. Update public-information memory
3. Identify mandatory decision or strategic phase
4. Generate legal candidate commands
5. Establish one or more current goals
6. Score candidates
7. Add bounded personality/randomness adjustment
8. Select a command
9. Submit through the gateway
10. Observe accepted events or violation

The engine's legal-action projection limits candidate generation, but commands are always revalidated.

## 6. Mandatory decision modules

The AI must eventually support:

- Initial settlement placement
- Initial road direction
- Required resource discard
- Robber destination
- Robber target
- Normal building
- City upgrades
- Development-card purchase
- Development-card play and follow-up choice
- Maritime trade
- Domestic trade response
- Domestic trade initiation
- End-turn decision

If no strategic action is legal or useful, the AI ends its turn rather than looping.

## 7. Strategic goals

Representative goals:

```text
BUILD_SETTLEMENT
BUILD_CITY
EXPAND_TO_VERTEX
SECURE_PORT
BUY_DEVELOPMENT_CARD
CONTEST_LONGEST_ROAD
CONTEST_LARGEST_ARMY
BLOCK_LEADER
REDUCE_SEVEN_RISK
IMPROVE_PRODUCTION_DIVERSITY
```

A goal is not a command. It changes marginal resource values and candidate scores.

## 8. Board-production evaluation

Use dice pip weights:

| Number | Weight |
|---:|---:|
| 2 / 12 | 1 |
| 3 / 11 | 2 |
| 4 / 10 | 3 |
| 5 / 9 | 4 |
| 6 / 8 | 5 |

A location score may include:

```text
expected production
resource diversity
resource scarcity
city-upgrade value
port synergy
future legal expansion
blocking value
robber exposure
opponent threat interaction
```

Do not reduce placement to pip sum alone.

## 9. Action evaluation

Candidate utility may combine:

```text
immediate VP
expected production increase
future build unlock
resource efficiency
network expansion
award progress
leader blocking
hand-risk reduction
opponent benefit
opportunity cost
```

Weights live in explicit profiles/configuration rather than scattered magic numbers.

## 10. Personality profiles

V1 profiles:

### Merchant

- Higher trade frequency
- Lower acceptable surplus threshold
- Strong port valuation
- More counter-offers

### Builder

- Higher settlement/production/expansion weights
- Prefers reliable board growth
- Moderate trading

### Sentinel

- Higher leader-blocking and opponent-threat weights
- More defensive robber usage
- Less willing to help the leader

Conceptual profile:

```ts
export interface AiProfile {
  readonly id: AiProfileId;
  readonly tradeFrequency: number;
  readonly greed: number;
  readonly leaderBlocking: number;
  readonly expansionPreference: number;
  readonly cityPreference: number;
  readonly developmentCardPreference: number;
  readonly portPreference: number;
  readonly randomness: number;
}
```

Profiles alter weighting, not rule legality.

## 11. Controlled randomness

AI variation consumes the game seeded random source or a deterministically derived AI stream. It never calls `Math.random()`.

Randomness must be bounded so the AI does not choose obviously illegal or catastrophically dominated actions merely for personality.

Recommended pattern:

1. Score candidates
2. Keep candidates within a configured margin of the best
3. Weighted-select among that shortlist

## 12. Public-information memory

An AI may maintain estimates from observed events:

- Resource gained from production
- Resource spent on public builds/purchases
- Resources explicitly exchanged in trades
- Random theft with unknown identity where appropriate
- Monopoly transfers
- Discard counts with hidden composition

Memory stores ranges/probabilities, not secret truth.

The memory must be serializable or reproducible after loading a save. The simplest V1 approach is to save AI memory beside game state as application metadata or rebuild it from bounded public history.

## 13. Turn safety

LocalGameGateway enforces safeguards against implementation loops:

```text
Maximum AI commands per turn: 100
Maximum active domestic offers initiated per AI turn: 2
Maximum counter-offer depth per counterparty: 1
```

These are software safety policies, not game rules.

On budget exhaustion, the gateway records a diagnostic and attempts a legal `END_TURN` only if permitted; it must not corrupt state.

## 14. Performance boundary

Normal AI should remain responsive on a typical browser. Heavy future search may move to a Web Worker. React rendering must not block while a long decision calculation runs.

V1 heuristic logic should not need Monte Carlo Tree Search.

## 15. AI testing strategy

Tests should include:

- Mandatory decisions always return a legal command
- Same state/profile/seed produces the same command
- AI does not access hidden fields by type contract
- AI ends turn instead of looping when no useful action exists
- Robber avoids self-harm when a better target exists
- Discard produces exact required count
- Setup evaluation distinguishes high and low production
- Threat weighting changes a trade or robber decision near victory
- Personality profiles can produce different valid choices from the same state
