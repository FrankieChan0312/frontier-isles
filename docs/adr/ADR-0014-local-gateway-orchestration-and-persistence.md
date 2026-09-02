# ADR-0014: Local Gateway Orchestration and Versioned Browser Saves

- Status: Accepted
- Date: 2026-09-02
- Decision owners: Project owner and architecture assistant

## Context

The browser needs one application boundary that can coordinate a Human and three AI players without
leaking authoritative or opponent-private state into React. The same boundary must survive browser
reloads while preserving deterministic continuation and must expose enough transient status for an
interactive UI.

## Decision

- `LocalGameGateway` privately owns the live `GameState`; callers receive only a Human `PlayerView`
  and Human-redacted `PlayerEventView` values.
- Human and AI actors submit the accepted `CommandEnvelope` contract to the same `GameEngine`.
  Stale Human versions remain ordinary rule violations.
- After every accepted Human or AI transition, publish ordered redacted events, write a versioned
  save, and continue the AI loop until a Human pending decision, a Human turn, or victory.
- Resolve non-current pending actors explicitly, including discards and domestic-trade responders.
  Pause AI-to-Human negotiations until the Human accepts, rejects, or counters.
- Persist monotonic deterministic AI command counters, total command count, turn identity, and
  per-turn command keys. Command IDs derive from the counter; no UUID, clock, or random input enters
  decisions.
- Keep browser timestamps as injected save metadata outside the engine.
- Parse saves from `unknown`, reject unsupported versions and malformed metadata, run the accepted
  invariant chain, and verify Human and AI controller assignments before installing state.
- Put browser storage behind `GameSaveRepository`, with localStorage and in-memory implementations.
- Use separate vanilla Zustand stores: one for redacted session updates and one for transient UI
  interaction. Neither store may contain or mutate `GameState`.

## Consequences

### Positive

- React has one stable asynchronous interface that can later be replaced without rule changes.
- Hidden state remains confined to the gateway and serialized persistence.
- A loaded game continues with the same seeded engine state and AI orchestration metadata.
- Every accepted transition is recoverable, while illegal commands never overwrite a save.

### Negative

- The V1 repository stores one latest game rather than a multi-save catalogue.
- localStorage contains the complete authoritative local game because V1 is an offline browser game;
  it is not a security boundary against the device owner.
- Autosaving each command adds browser-storage work to long AI sequences.

## Alternatives considered

### Store authoritative state in Zustand

Rejected because UI actions could then mutate or diverge from the engine authority.

### Let AI call engine functions directly

Rejected because AI and Human legality must share the same command contract and gateway path.

### Generate random command IDs

Rejected because UUID or other hidden entropy would make orchestration harder to replay and test.

### Cast parsed JSON directly to GameState

Rejected because corrupt or incompatible saves must fail recoverably before entering the engine.
