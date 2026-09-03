# AI Simulation

## Core corpus command

Run the deterministic Stage 13 corpus with:

```text
npm run simulate:core -- 32
```

The optional positive integer selects the number of seeds. Seeds use the stable form
`CORE-AI-CORPUS-001`, `CORE-AI-CORPUS-002`, and so on. Output is deterministic JSON containing each
winner, command count, turn count, final version, and final random draw count.

## Safety and validation

- Maximum 100 AI commands per player turn
- Maximum 20,000 commands per game
- Maximum 2,000 turns per game
- Maximum 12 identical command keys in one turn
- Exact one-version progress for every accepted command
- Repeated authoritative-progress-state detection
- Full game/trading/development/scoring invariant validation after every accepted command

Failures report seed, state version, turn, phase, actor, command key, and violation or diagnostic.
The ordinary test suite covers 16 fixed seeds in four parallel batches. The harness controls all
four seats as AI while preserving the accepted one-Human/three-AI creation contract in authoritative
state.

## Mixed personality corpus

Run the Stage 14 trade/personality corpus with:

```text
npm run simulate:mixed -- 32
```

Seats rotate through Merchant, Builder, and Sentinel profiles. The ordinary suite runs 24 fixed
mixed-profile games in six parallel batches. Domestic offers, rejections, acceptances, and counters
remain ordinary commands; a negotiation may revisit the exact pre-offer state, so repeated-state
detection permits the bounded two-attempt policy before diagnosing a loop.

## V1 release corpus

Run the Stage 17 qualification corpus with:

```text
npm run simulate
```

This fixed 100-game corpus uses seeds `V1-RELEASE-001` through `V1-RELEASE-100`, rotates all three
personality profiles, and emits per-game summaries plus an ordered deterministic hash. Invariant
failures are wrapped with seed, state version, turn, phase, actor, command key, and the underlying
violation. The qualification totals and browser release suite are recorded in `docs/TESTING.md`.
