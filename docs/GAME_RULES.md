# Frozen Game Rules

## 1. Ruleset identity

```text
BASE_4P_COMBINED_ACTION_V1
```

This repository implements its own explicit rules contract. When terminology differs across physical editions, the behaviour written here controls the software until changed by an accepted ADR and corresponding tests.

Rules precedence:

1. This document
2. Accepted ADRs that explicitly amend this document
3. Official base-game rulebook and official base-game FAQ
4. No unstated assumption

Reference pages:

- https://www.catan.com/understand-catan/game-rules
- https://www.catan.com/faq/basegame

The project paraphrases mechanics and must not copy official rulebook prose or presentation.

## 2. Players and objective

- Exactly four players
- One human and three AI players in V1
- First player to establish a valid victory during that player's own turn wins
- Victory target: 10 actual victory points
- Hidden victory-point development cards count toward actual score
- Opponents see public score only until hidden points are revealed for victory

A player who reaches 10 points outside their own turn does not immediately win. Victory is checked when their own turn begins and after their successful commands.

## 3. Board component distribution

### Terrain

| Terrain | Count | Production |
|---|---:|---|
| Forest | 4 | Lumber |
| Pasture | 4 | Wool |
| Fields | 4 | Grain |
| Hills | 3 | Brick |
| Mountains | 3 | Ore |
| Desert | 1 | None |

### Number tokens

```text
2 x1
3 x2
4 x2
5 x2
6 x2
8 x2
9 x2
10 x2
11 x2
12 x1
```

The desert has no number token. Six and eight are red numbers and must not be adjacent in generated V1 boards.

### Ports

- Four generic 3:1 ports
- One 2:1 port for each of the five resources
- A port is usable by a player with a settlement or city on either of its two coastal vertices

## 4. Player piece supply

Each player begins with a finite personal supply:

- 15 roads
- 5 settlements
- 4 cities

Building is illegal when the required piece is unavailable. Upgrading a settlement to a city returns that settlement piece to the player's supply.

## 5. Bank and development deck

### Bank resources

The bank begins with 19 cards of each resource type.

Production shortage is decided independently for each resource type across every matching unblocked
tile in that roll. When the bank cannot satisfy multiple entitled players, nobody receives that
resource and its bank supply remains unchanged. When only one player is entitled, that player
receives as many cards as remain, allocated in deterministic tile order. Other resource types are
resolved normally, and bank counts never become negative.

### Development deck

The V1 deck contains 25 cards:

- 14 Knight
- 5 Victory Point
- 2 Road Building
- 2 Monopoly
- 2 Invention / Year of Plenty effect

The software may use original card names in the public UI while preserving these effects.

## 6. Setup phase

### Starting order

The seeded random source chooses the first player. Clockwise order is then fixed for the match.

### Placement sequence

For players A, B, C, D:

```text
First pass:  A, B, C, D
Second pass: D, C, B, A
```

On each setup placement, the player places:

1. One settlement on a legal empty vertex
2. One road on an empty edge adjacent to that newly placed settlement

Setup settlements do not require connection to an existing road, but the distance rule always applies.

After placing the second settlement, the player immediately receives one resource from each adjacent producing terrain hex. This transfer is committed by the settlement command before that player's setup-road command. Desert contributes nothing. Bank-shortage handling still applies.

The first player begins the first normal turn after all setup placements finish.

## 7. Distance rule

A settlement is legal only when:

- the target vertex is empty;
- every adjacent vertex is free of a settlement or city;
- outside setup, at least one adjacent edge contains the acting player's road;
- the player can pay the cost and has a settlement piece.

A city can only replace the acting player's own settlement on that vertex.

## 8. Normal turn state machine

The normal turn is represented by explicit phases rather than UI assumptions.

```text
TURN START
  -> ROLL_REQUIRED
  -> normal production OR seven-resolution sequence
  -> ACTION
  -> END_TURN
```

A previously acquired eligible development card may be played before rolling or during the Action phase, subject to the one-card-per-turn restriction.

### Combined Action phase

During `ACTION`, the current player may interleave legal actions in any order and repeat them while able:

- Domestic trade
- Maritime trade
- Build road
- Build settlement
- Upgrade city
- Buy development card
- Play one eligible development card if none has been played this turn
- End turn

Building a port settlement may therefore improve maritime trade later in the same Action phase.

## 9. Dice and production

- A normal roll uses two six-sided dice
- Totals 2–6 and 8–12 produce resources
- Every unblocked tile matching the total produces
- Settlement: one resource from each adjacent producing tile
- City: two resources from each adjacent producing tile
- All eligible players receive production, not only the roller
- A tile occupied by the robber produces nothing
- Total 7 produces no terrain resources

All dice use the seeded random source. A successful roll draws the first die and then the second die
from the immutable random cursor. Producing tiles are processed in ascending axial coordinate order;
within each tile, allocations follow fixed player order. Multiple buildings owned by one player on
one tile form one allocation, while allocations from different tiles remain separate.

## 10. Rolling seven

When the current player rolls seven:

1. Every player with more than seven resource cards must discard half, rounded down.
2. Required discards are completed.
3. The current player moves the robber to a different land tile.
4. If one or more opponents have a settlement/city adjacent to that tile and at least one resource card, the current player chooses one eligible target.
5. One resource card is stolen uniformly at random from that target's resource hand.
6. The turn enters `ACTION`.

Development cards do not count toward the seven-card threshold and cannot be stolen by the robber.

The digital discard workflow permits affected players to submit their exact selections in any
order while the rolling player remains current. Each player returns exactly half their resource
cards, rounded down, to the bank; stored completion IDs remain in fixed player order. Development
cards never participate.

After all required discards, the rolling player must move the robber to a different authoritative
land tile. An opponent is eligible for theft only when they own an adjacent settlement or city and
currently hold at least one resource card. Roads do not create eligibility, and repeated adjacent
buildings do not duplicate a target. With no eligible opponent, the turn resumes `ACTION`
immediately. With one or more, an explicit target command is required, including the one-target
case. One physical resource card is then selected uniformly through the seeded random source in
the frozen resource-type order and transferred to the rolling player.

Playing a Knight moves the robber and may steal a card, but does not trigger discards.

## 11. Building costs

| Action | Cost |
|---|---|
| Road | 1 Lumber + 1 Brick |
| Settlement | 1 Lumber + 1 Brick + 1 Wool + 1 Grain |
| City | 2 Grain + 3 Ore |
| Development card | 1 Wool + 1 Grain + 1 Ore |

Costs are paid to the bank before placement/draw is finalized within one atomic successful command.
Paid construction derives each player's remaining supply from authoritative board occupancy rather
than storing counters in player state. The standard limits are 15 active roads, 5 active
settlements, and 4 active cities. A city upgrade replaces one settlement at the same vertex, so
that settlement piece becomes available again through derived counting.

## 12. Road placement

A road is legal only when:

- the edge is empty;
- the player can pay and has a road piece, unless placement is free;
- it connects to the player's road, settlement, or city;
- an opponent building on the connecting vertex does not block the connection.

An opponent settlement or city can interrupt route continuity. The acting player's own settlement or city does not interrupt their own road.

For paid placement, either endpoint may establish the required connection. The acting player's own
building connects directly. An empty endpoint connects through another incident road owned by the
actor. An opponent building prevents the actor's existing incident road from continuing through
that endpoint; if the other endpoint independently connects, the road remains legal. Another
player's road at an empty intersection neither connects nor blocks the actor.

Paid settlements require an incident road owned by the actor in addition to the empty-vertex and
distance rules. They grant no setup resources. A city may replace only the actor's own settlement;
it cannot be placed on an empty vertex, an opponent building, or an existing city.

## 13. Domestic trade

- Only the current player may initiate a domestic trade.
- The current player remains the stable initiator and selects exactly one other player as the
  counterparty; two non-current players cannot trade with each other.
- The counterparty may accept, reject, or make one formal counter-offer. The initiator may then
  accept or reject that counter, but may not counter again in the same chain.
- Resources move only when the current terms are explicitly accepted. Both parties are checked
  again at acceptance and the exchange is atomic.
- Only resource cards may be traded.
- Both sides must give at least one resource card.
- A resource type cannot have a positive quantity on both sides; overlapping quantities are not
  netted into a disguised gift.
- Development cards, future promises, loans, services, and binding future agreements are not supported.
- Proposal and counter submission validates only the author's outgoing bundle. The other party's
  private hand is not tested until acceptance.
- Multiple legal trades may occur in one Action phase.

Human-versus-AI offers display an explicit response. AI-to-AI offers resolve through the same command and validation contracts.

## 14. Maritime trade

A player may exchange multiple cards of one resource type for one card of a different resource type:

- 4:1 without a port
- 3:1 with a generic port
- 2:1 with the matching resource port

The engine determines the best legal ratio available to the player. The bank must have the requested card. A player may perform multiple separate maritime trades in one Action phase.

A player controls a port by owning a Settlement or City at either endpoint of its coastal edge.
Port control is derived from current board occupancy, so a port built earlier in the same combined
Action phase is immediately usable. Other players' buildings provide no benefit and the robber
does not disable ports. Matching 2:1 is preferred over generic 3:1, with 4:1 always available.

## 15. Development cards

### Purchase

- During `ACTION`, pay exactly one Wool, one Grain, and one Ore and draw the top card at deck
  index `0`.
- A player may repeat purchases while able to pay and while the deck is non-empty.
- Keep the card private.
- A non-victory-point card bought this turn cannot be played this turn.
- A newly bought hidden Victory Point card counts immediately and can establish victory without
  consuming the action-card allowance.

### Per-turn limit

At most one non-Victory-Point development card is played during a player's turn. An eligible card
acquired on an earlier turn may be played in `ROLL_REQUIRED` before rolling or during `ACTION`.
Victory Point cards are never played as actions; they are revealed automatically when establishing
victory.

### Knight

- Move robber to a different tile
- Select an eligible adjacent opponent
- Steal one random resource if a target exists
- Mark the Knight played and increment played-Knight count when the card is played
- Reconcile Largest Army immediately, but finish movement and any theft before establishing a
  resulting victory
- Resume `ROLL_REQUIRED` when played before rolling, otherwise resume `ACTION`
- Do not trigger seven-card discards

### Road Building

Place up to two free legal roads, one at a time. Normal connectivity, blocking, empty-edge, and
piece-supply rules apply, but no Lumber or Brick is paid. The effect ends after two roads, when the
piece supply is exhausted, after a winning first road, or through dead-end completion when no legal
second placement remains.

### Monopoly

Choose one resource type. In player order, every opponent transfers all cards of that type to the
acting player. Choosing a type held by no opponent is legal and the bank is unchanged.

### Invention / Year of Plenty effect

Take exactly two available bank resource cards. They may be the same or different. The card may be
played only when the bank contains at least two resource cards in total, and the final choice may
not exceed the bank's supply of either selected type.

### Victory Point

Counts as one hidden actual victory point while in hand. It cannot be played and is revealed,
together with all of the winner's hidden Victory Point cards, when victory is established on the
owner's turn.

## 16. Largest Army

- Requires at least three played Knight cards
- First qualifying player receives the award and 2 VP
- A challenger must have strictly more played Knights than the current holder
- A tie leaves the award with the current holder
- With no current holder, only one unique qualifying maximum receives the award; a tied maximum
  remains unheld.

## 17. Longest Road

- Requires a continuous route of at least five roads
- No edge may be used more than once in a candidate path
- Branches do not all add together; use the longest valid trail
- Loops are valid
- Opponent buildings interrupt continuity at their vertex
- Own buildings do not interrupt continuity
- A challenger must have a strictly longer qualifying road than the current holder
- A tie leaves the award with the current holder when the holder still qualifies
- If an interruption creates a situation where no single player uniquely qualifies under the frozen tie rules, the award can become unheld; exact award-recalculation cases require dedicated tests
- Award reconciliation occurs after every successful paid road, settlement, or city build,
  including settlement interruption of another player's route.

Longest Road is a graph problem and must not be calculated as total roads owned.

## 18. Victory

Actual victory points are derived from:

- Settlements: 1 each
- Cities: 2 each
- Longest Road award: 2
- Largest Army award: 2
- Hidden Victory Point development cards: 1 each

Public victory points include settlements, cities, both awards, and revealed Victory Point cards.
Actual victory points add in-hand hidden Victory Point cards. Other development-card types never
score, and a Victory Point card may not have `PLAYED` status.

When the current player has at least 10 actual points during their own turn, the engine reveals all
of that player's hidden Victory Point cards, emits `GAME_WON`, sets the winner, and enters
`GAME_OVER`. A non-current player at 10 does not win until their turn begins; `END_TURN` performs
that check for the newly current player before any dice roll.

## 19. Mandatory edge-case tests for later tasks

- Seven cards versus eight cards at discard time
- Multiple resource types when only one bank supply is short
- Second setup settlement beside the desert
- Opponent building splits a route
- Own building does not split a route
- Forked route
- Closed loop with a branch
- Longest Road holder tied by challenger
- Holder falls below five after interruption
- Newly bought non-VP development card cannot be played
- Newly bought VP card can establish victory
- Knight does not trigger discards
- Building a port then trading in the same turn
- Attempted zero-sided trade
- Attempted same-resource disguised gift
- Victory score reached outside own turn
