# ADR-V2-0011: Active Game Presence and AI Replacement

- Status: Accepted
- Date: 2026-09-07
- Scope: V2-10

## Decision

Any disconnected active Human pauses the online GameSession. Keep the existing 30-second
server-authoritative reconnect grace. This supersedes the conditional pause sketch and Goal B's
expired fixed-seat behavior. The game-core GamePhase, GameState and RNG do not change for presence.
The network lifecycle adds `PAUSED_RECONNECTING`, `PAUSED_REPLACEMENT_REQUIRED` and `CLOSED` to
`ACTIVE`, `FINISHED` and the existing fail-safe `ERROR`. `FINISHED` is the accepted completed state.

Presence is a synchronous transport safety latch. Human mutations check it within the serialized
command boundary. An awaited AI choice must recheck lifecycle and presence generation before
execution; a choice spanning a presence change cannot mutate state or consume RNG. The single
AI pipeline resumes only after every unresolved Human has resumed or been replaced. Exact cached
acknowledgements remain readable by authorized connected sessions while paused; they are not new
mutations. New paused commands receive a safe lifecycle refusal without poisoning their cache ID.

Expiry invalidates the Human credential and leaves the seat requiring a replacement decision.
Transfer an expired Host to the first connected Human in canonical NORTH/EAST/SOUTH/WEST order.
When nobody is connected but credentials remain within grace, retain the pause so they can resume;
transfer Host to an eligible resumed Human if necessary. Close when no eligible Human remains.

Only the current connected Host may replace an expired Human, selecting an accepted AI profile.
The UI initially selects Builder; the request always includes the explicit profile. Replacement
and authority revalidation execute in the GameSession queue. An online controller overlay gives
AI the same PlayerId and position without rewriting the core player contract or any resources,
cards, pending decisions, board, RNG or state version. AI receives only that PlayerId's projected
view. Public projections show the effective controller and public replacement metadata. The old
Human mapping, cached results and resume authority are removed; reclamation is not supported.

The Host can close a game while a replacement decision is required. An unresolved replacement
decision expires after `GAME_ABANDONED_TTL_MS` (default 30 minutes), measured from the first expiry,
and snapshots do not extend it. Fully resolving presence cancels that deadline. Finished games
use the same configured retention from completion; losing every eligible Human can close earlier.
Timers run only in the Room infrastructure and are cancelled at closure/disposal. Closure stops
AI and emits only a public reason before discarding the process-local Room.

## Browser boundary and verification

Strict shared presence schemas carry seat identifiers, reconnect deadlines, replacement status,
selected AI profiles and an abandoned deadline. They carry no session IDs, token data, choices,
hands, RNG or state. The browser countdown is presentation only: reaching zero does not authorize
replacement. The Host control appears only after the authoritative expired status arrives.

The UI disables gameplay while paused, displays public disconnected seats, the countdown,
replacement/closure controls or a waiting-for-Host message, and announces recovery accessibly.
Private decision state remains authoritative and is restored from a fresh PlayerView on resume.
Verify current/non-current disconnects, private decisions/trade, exact deadline boundaries,
multiple Humans, Host transfer, original-session denial, redacted AI continuation, no progress
while paused, empty/explicit/abandoned closure and all three required viewport sizes. V1 local
authority and all accepted Goal A/B workflows remain regression gates. Durability follows in V2-11.
