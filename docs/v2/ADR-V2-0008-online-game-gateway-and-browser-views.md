# ADR-V2-0008: Online Game Gateway and Browser Views

- Status: Accepted
- Date: 2026-09-06
- Scope: V2-07

## Decision

Use the V2 roadmap's concrete name `SocketGameGateway` for the V1 architecture document's
`WebSocketGameGateway` placeholder. No accepted executable domain identifier changes. The
Node.js/Socket.IO decision in ADR-V2-0001 replaces that historical document's Spring Boot sketch.

SocketLobbyGateway owns one socket and the accepted tab-scoped session credential. It composes
SocketGameGateway on that same socket; the game gateway sees public Lobby state and attachment
status only. React depends on GameGateway and receives only PlayerView, projected events and
transport status. LocalGameGateway and its offline save/AI behavior remain separate and intact.

Human command IDs wrap the caller's stable envelope ID in a lazy cryptographic UUID namespace
created once per gateway instance. Retrying the same envelope during that instance produces the
same wire ID; a refresh/new tab creates a new namespace. Tests inject the namespace. This entropy
is independent of game RNG and carries no authority or credential. The transport explicitly picks
command fields and omits actorId; the server resolves it from the attached session.

The gateway validates complete responses and checks Room/game/viewer identity before adoption.
Older state versions or publication revisions are ignored. Gaps, reconnect, stale rejection and
manual Resync request a current snapshot. Acknowledgements contain outcomes; publication and
snapshot supply the authoritative view. No optimistic execution, local event replay, automatic
command retry or browser AI occurs online. Pending acknowledgement/resync disables controls.
Disconnection invalidates pending work by attachment epoch; the last own view remains read-only.
Event receipts are completed promptly. Disposal removes game listeners and the Lobby subscription;
the owning Lobby gateway disposes the socket.

The application maintains separate local and online projection stores. Clearing/changing viewer
or game identity clears event history. Online state never enters the offline save adapter.
Host Start follows authoritative readiness and transitions every Human from Lobby into GamePage.
The shared board, controls and dialogs use projected legal actions. Online mode displays Room code,
connection/submission/resync status and a resync control, with no offline Save/Restart controls.
Human cards distinguish the viewer from another Human; robber-target controls require the viewer
to be the acting player. Trade editors distinguish Human and AI counterparties without private data.

Within existing grace, refresh resumes the same seat and obtains the current view. The newest tab
wins; the original remains read-only with the accepted safe explanation. After victory, the existing
new-game action clears the local Room credential and connection and returns Home. It does not
remove a fixed server seat, reset the GameSession or establish a post-game Room reuse policy.

## Verification and boundaries

Focused tests use the real server and existing socket gateway to cover authority, ordering,
stale/duplicate outcomes, private views/events, reconnect and listener disposal. Playwright uses
a separate Node test process with an injected fixed seed; production has no fixture route, API,
environment switch or browser state injection for online games. Two real browsers exercise setup,
turns, stale rejection/resync, refresh/replacement and private views at all required viewport sizes.
The accepted Lobby and eight Single Player journeys remain in the full suite.

No external dependency is added. Client retry/delivery guarantees, extended disconnect policy,
replacement, durable games and server restart recovery remain later tasks.
