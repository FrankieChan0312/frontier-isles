# ADR-V2-0009: Online Workflow Qualification

- Status: Accepted
- Date: 2026-09-07
- Scope: V2-08

## Decision

Qualify the existing shared engine, server GameSession and browser gateway together. Do not add
a second multiplayer rules implementation. A Node test harness creates actual Rooms and Human
Socket.IO clients, assigns the remaining AI seats through the Host API and starts one GameSession.
Human test drivers call the shared personality agent with only their own freshly received network
PlayerView and their own command history. Those drivers are test code; production online AI runs
only inside the server GameSession and always uses the authoritative Lobby profile.

Run one complete 2H+2AI, 3H+1AI and 4H game, each twice with the same seed. Validate every accepted
transition with the complete core invariant chain, exact version progress and seeded RNG transition.
Freeze each preceding state recursively to detect mutation. Require one current-player legal winner,
finished Room/GameSession and equal public state across every Human. Bound each test game to 5,000
commands and 1,000 turns in addition to the existing agent/server safety limits. Compare repeated
summaries including commands, turns, scores, RNG draw count and a public command/phase trace hash.
Only public seat/turn/phase/command-type traces are printed on failure; no private command payload,
hand, hidden card identity, token, RNG cursor or unrestricted state is printed.
Failure diagnostics identify the operation, a safe timeout/check category and connected-client
count. Each incoming publication is validated, then unused historical views are released after
each full-game snapshot step; focused event tests continue to retain the history they inspect.

Rare workflows use invariant-valid Node fixtures derived from accepted core test helpers. Remap
the complete public ownership/player identity fields to the server's canonical Room seats and
retain the accepted core behavior. Tests perform the resulting transitions through real command
contracts. No fixture enters the browser or its localStorage. The separate Playwright Node server
recognizes an explicit fixture-name whitelist when constructing tests and binds only to loopback.
Production imports neither that executable nor the fixture modules, and exposes no fixture route,
debug command, seed override or state-installation API.

Exercise every command family through real online browser controls. Retain all eight V1 and six
Goal A browser journeys. Add card effects, paid builds, controlled seven, free-road dead-end
completion, maritime trade, Human/Human and Human/AI/AI/Human negotiation, both awards and victory.
Confirm a finished game resumes as finished and that returning Home detaches only that browser's
credential. Production rules and lifecycle policy need no additional changes for this task.

## Audit and boundaries

Strict schemas and per-viewer assertions cover updates, snapshots, events, acknowledgements and
Room state. Source checks enforce the React/gateway/engine split and exclude production fixture
imports. Projection stores clear identity-specific history; React props and DOM expose only the
current PlayerView. Browser tests inspect private card/resource UI and accessibility output and
require no console/React errors or online save writes. Node logging tests reject poisoned actor
input without echoing it and require secret AI exceptions to produce only a safe lifecycle.

No dependency is added. The existing engine, AI profiles, protocol and server authority remain
unchanged. Delivery guarantees/retries/concurrency, extended disconnect pause or replacement,
durable Room/Game repositories, restart recovery and deployment hardening remain V2-09 through
V2-12. Goal B automated acceptance does not claim completion of the full V2 alpha or Human UAT.
