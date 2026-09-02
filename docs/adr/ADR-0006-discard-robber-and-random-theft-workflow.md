# ADR-0006: Discard, Robber, and Random Theft Workflow

- Status: Accepted
- Date: 2026-09-02
- Decision owners: Project owner and architecture assistant

## Context

Task 06 pauses a rolled seven at an explicit discard or robber-move pending decision. Completing
that workflow requires commands from players other than the current player, authoritative target
derivation, and deterministic random theft without widening accepted contracts or creating the
complete command router.

## Decision

- Affected players may submit required discards in any order while the original rolling player
  remains `turn.currentPlayerId`. Store completed player IDs in canonical `playerOrder` order.
- Validate an exact five-resource discard bag, transfer selected cards from hand to bank, and move
  to robber placement only when the final requirement completes.
- Keep robber movement and theft as separate commands. Moving always changes to a different valid
  tile and consumes no randomness.
- Derive eligible targets from post-move authoritative vertex occupancy and positive resource-card
  counts. Exclude the actor, roads-only owners, and empty hands; deduplicate and order by
  `playerOrder`.
- Require an explicit target command whenever at least one eligible player exists, including when
  exactly one player is eligible. Do not auto-steal during movement.
- Select one physical resource card uniformly by drawing one accepted bounded integer across the
  target's total cards and interpreting the index in frozen `RESOURCE_TYPES` order. A one-card hand
  still consumes this draw.
- Extend the normal-turn invariant to accept a fully resolved dice-seven state as `ACTION` with a
  total-seven `lastRoll` and null pending decision. A coherent target pending decision is required
  in `ROBBER_TARGET_REQUIRED`.
- Preserve the accepted Knight robber cause for future workflow resolution: resume
  `ROLL_REQUIRED` before dice and `ACTION` after dice, without implementing Knight play.

## Consequences

### Positive

- Discard submission timing cannot alter stored order or the rolling player's turn ownership.
- Target legality cannot drift from board occupancy or current private hand state.
- Random theft is replayable and consumes the same explicit random cursor as board generation and
  dice.
- Movement, target choice, and theft have stable validation and event boundaries.

### Negative

- Even a sole target requires a separate command.
- Pending target lists must be re-derived and checked before theft.
- The engine must validate global resource conservation while resolving the workflow.

## Alternatives considered

### Temporarily change the current player during discards

Rejected because the seven interrupts one player's turn; affected-player command eligibility is
better represented by the pending decision.

### Auto-steal during robber movement

Rejected because it merges target validation and random consumption into movement and creates a
different path for one versus multiple targets.

### Select a resource type uniformly

Rejected because theft must be uniform across physical cards, not across the distinct resource
types present in a hand.
