# ADR-0011: Unified Engine and Redacted Player Projections

- Status: Accepted
- Date: 2026-09-02
- Decision owners: Project owner and architecture assistant

## Context

Tasks 05–11 deliberately exposed focused command executors so each rule family could be accepted in
isolation. The browser application and AI now need one complete command boundary, but composing those
executors must not duplicate validation or expose authoritative private state. The accepted Task 01
view skeleton also needs complete legal choices and viewer-specific event redaction.

## Decision

- Add one exhaustive `GameEngine` boundary with creation, command execution, and player-view
  projection operations.
- Route each frozen `GameCommand` discriminant to its accepted focused executor. `BUILD_ROAD` routes
  to the development-card executor only while a free-road effect is authoritative; otherwise it
  routes to paid building.
- Run the complete accepted invariant stack before routing so corrupted authoritative state fails
  with a diagnostic error while ordinary illegal commands retain focused-executor violation order.
- Build `PlayerView` as a detached plain-data graph. It contains the viewer's exact private data,
  public opponent counts and scores, cloned public board/turn data, viewer-appropriate pending data,
  and authoritative bounded legal choices.
- Preserve the accepted view contract fields and add optional Stage 12 capabilities so existing
  Task 01 consumers remain source-compatible.
- Project `GameEvent` into a separate `PlayerEventView` union. Discard composition, bought-card
  identity, active offer contents, and stolen-resource identity are redacted when the viewer is not
  entitled to them. The accepted `GameEvent` union remains unchanged.
- Reuse accepted validators and selectors for every legal target. The projection enumerates only
  bounded targets such as board IDs, two-card Invention selections, and maritime pairs; it does not
  enumerate domestic resource bundles.

## Consequences

### Positive

- Human and AI callers use one exhaustive command boundary without bypassing accepted rules.
- UI, stores, logs, and AI can operate without receiving `GameState`, the deck, the random cursor,
  or opponent private composition.
- Legal placement and action controls cannot drift into UI-owned approximations.
- Same seed and command sequence replay through one deterministic application-facing engine.

### Negative

- The player projection clones the standard board graph on each update; this bounded V1 cost is
  accepted in exchange for preventing runtime mutation through shared references.
- Some new legal-action fields are optional at the type boundary for Task 01 compatibility, so new
  consumers must tolerate older view producers.
- Active domestic offer contents are visible only to the two parties, which requires an observer
  placeholder for other viewers.

## Alternatives considered

### Replace the focused executors with one new implementation

Rejected because it would duplicate accepted rule behavior and risk changing validation precedence.

### Expose readonly `GameState`

Rejected because TypeScript readonly types do not prevent runtime mutation and would expose the
development deck, random cursor, exact opponent hands, and hidden cards.

### Send raw events to every viewer

Rejected because accepted events intentionally contain authoritative private outcome fields that
are unsafe for uninvolved viewers.
