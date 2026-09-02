# ADR-0012: Redacted Deterministic Core AI

- Status: Accepted
- Date: 2026-09-02
- Decision owners: Project owner and architecture assistant

## Context

V1 needs computer-controlled players that can complete every mandatory decision without inspecting
authoritative opponent data. Decisions must remain reproducible and must not consume the game random
cursor merely to break strategic ties. Long-running local orchestration also needs explicit failure
bounds rather than relying on the agent to terminate itself.

## Decision

- Define an asynchronous `AiAgent.chooseNextCommand(PlayerView, AiDecisionContext)` boundary. The
  agent never receives `GameState`; the caller creates command envelopes and executes them through
  `GameEngine`.
- Implement one Stage 13 core heuristic engine for setup, dice, discard, robber, building,
  development cards and their pending choices, maritime trade, and end turn. Domestic offers use a
  deterministic reject policy until Stage 14 adds negotiation strategy.
- Score decisions from visible production pips, diversity, resource scarcity, expected income,
  build unlocks, expansion, port/city value, award progress, opponent public threat, and projected
  score. Equal scores use direct code-unit comparison.
- Consume no random source during deliberation. Game randomness remains exclusively in successful
  authoritative commands such as dice and theft.
- Enforce per-turn, per-game, repeated-command, state-progress, repeated-state, and maximum-turn
  guards. Invalid commands fail through the ordinary engine and simulation errors include seed,
  version, turn, phase, actor, command, and violation/error.
- Use the accepted one-human configuration for creation, then let the simulation harness control all
  four seats with the same AI. This tests all-seat behavior without weakening the frozen V1 config.

## Consequences

### Positive

- AI behavior is replayable from the same public view and context.
- Type boundaries prevent direct hidden-hand, hidden-card, deck, and future-random access.
- Every simulated command traverses the same legal engine boundary as a human command.
- Fixed-seed smoke games detect mandatory-decision gaps and non-termination regressions.

### Negative

- The Stage 13 AI is intentionally heuristic and does not yet negotiate domestic trades.
- Deterministic tie-breaking can make repeated seeds strategically similar.
- Full invariant checks and detached player views add bounded simulation cost.

## Alternatives considered

### Give local AI the authoritative state

Rejected because it would cheat in V1 and make later multiplayer migration unsafe.

### Consume the game RNG for personality variation

Rejected because equivalent strategic choices would alter dice, theft, deck, and replay outcomes.

### Monte Carlo search

Rejected because a bounded heuristic agent is sufficient for responsive V1 play and easier to
audit for hidden-information access.
