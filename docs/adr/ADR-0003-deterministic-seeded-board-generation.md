# ADR-0003: Deterministic Seeded Board Generation

- Status: Accepted
- Date: 2026-09-02
- Decision owners: Project owner and architecture assistant

## Context

Initial standard-board content must be reproducible from a user-visible seed, serializable for
future saves, and implementable with identical unsigned operations in TypeScript and Java. The
board must always separate adjacent red numbers without probabilistic retry generation.

## Decision

- Hash the seed's JavaScript UTF-16 code units with the frozen FNV-1a-style boundary, preserving
  the exact non-empty seed text and replacing only a zero hash with `0x6D2B79F5`.
- Use the accepted `XORSHIFT32_V1` transition with immutable, explicit `RandomState` threading.
- Generate bounded integers with rejection sampling and count rejected draws.
- Shuffle copied arrays with the frozen descending immutable Fisher–Yates algorithm.
- Generate standard content in port-first order: ports, terrains, red candidate IDs, red tokens,
  then non-red tokens.
- Place red numbers with the first valid four-tile independent set found by the frozen finite
  depth-first combination search. Do not reshuffle or retry whole boards.
- Keep generated terrain, number, robber, and occupancy content in `src/game/**` domain data and
  outside the Task 03 UI topology renderer.

## Consequences

### Positive

- Equal seed and random state reproduce the same board and final draw count.
- Rejection counts and golden fixtures provide a cross-language parity contract.
- Red-number non-adjacency is guaranteed constructively with bounded work.
- No global entropy or mutable RNG can silently alter deterministic replays.

### Negative

- Changing source distribution order or generation steps would change all later seeded fixtures.
- XORSHIFT32 is deterministic rather than cryptographically secure and must not be used for
  security-sensitive randomness.
- Callers must thread successor random state explicitly through later game operations.

## Alternatives considered

### Platform or cryptographic randomness

Rejected because hidden entropy cannot reproduce a board from its seed or match a future Java
engine.

### Modulo-only bounded sampling

Rejected because it introduces statistical bias when the range does not divide `2^32`.

### Retry generation until red numbers are separated

Rejected because it creates variable, potentially unbounded draw consumption and makes fixtures
dependent on retry behaviour.
