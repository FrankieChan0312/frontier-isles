# Frontier Isles V2 — Online Multiplayer Product Scope

Status: Architecture planning baseline  
Target: V2 online multiplayer alpha  
Repository: `frontier-isles`  
Stable baseline: browser-only V1 remains preserved on `main`

## 1. Product goal

Extend the existing browser game so real players on different browser sessions can join the same room and play through a server-authoritative game.

The first online release remains the same base-game ruleset already implemented by V1. Multiplayer work changes connection, orchestration, identity, state ownership, recovery, and deployment. It must not silently redesign the game rules.

## 2. Player model

V2 alpha uses exactly four game seats because the accepted game engine is a fixed four-player ruleset.

A room may start when:

- at least two Human players are connected and ready;
- all remaining seats are explicitly filled with existing AI profiles by the Host; or
- all four seats are occupied by Human players.

Supported examples:

- 2 Humans + 2 AI
- 3 Humans + 1 AI
- 4 Humans

Single-player remains available through the accepted V1 LocalGameGateway.

## 3. V2 alpha user journey

1. A player opens Online Multiplayer.
2. The player enters a display name.
3. The player creates a room and receives a six-character room code.
4. Other players join with that code.
5. The Lobby shows seats, Host, connection status, AI seats, and Ready status.
6. The Host starts when start conditions are satisfied.
7. The Server creates the authoritative GameState.
8. Each Human receives only their own redacted PlayerView.
9. Clients submit commands; the Server validates and executes them.
10. All players see synchronized public changes and their own private data.
11. A temporarily disconnected player can resume the same seat.
12. The game reaches a legal winner.

## 4. Included in V2 alpha

- Node.js + TypeScript realtime server
- Socket.IO client and server
- Room creation and joining
- Fixed four-seat Lobby
- Host and Ready state
- Optional AI fill for empty seats
- Server-generated room codes and resume credentials
- Reconnect and explicit state resynchronization
- Server-authoritative GameState and command execution
- Per-player PlayerView and event projection
- Domestic trade between Human players
- Human/AI mixed games
- Stale-version handling and safe command acknowledgement
- Duplicate-command protection
- Local development with two or more browsers
- Automated multi-client integration tests
- Multi-browser Playwright E2E
- Deploy-ready frontend and long-running Node server configuration

## 5. Explicitly excluded from V2 alpha

- User accounts
- Firebase or OAuth login
- Matchmaking
- Rankings or leaderboards
- Spectators
- Chat
- Voice
- Friend lists
- Payments
- Five- or six-player rules
- Expansions
- Multiple server instances
- Redis adapter
- Cross-region deployment
- Mobile native application
- Public production launch before Human UAT

## 6. Persistence boundary

The initial Lobby milestone is intentionally in-memory.

For the first complete V2 alpha, durable storage is a separate stage. The architecture must use repository interfaces from the beginning so an in-memory implementation can later be replaced without changing Socket handlers or game rules.

A single-process deployment is the first supported production shape. Multi-instance scaling is deferred.

## 7. Availability policy

Temporary disconnections must not change player identity.

A room uses a durable session/resume credential rather than `socket.id`. During an active game:

- a disconnected Human seat enters a reconnect grace period;
- the authoritative game pauses when that Human must act;
- after expiry, the Host may replace that seat with an AI or close the game;
- the exact policy is implemented and tested in a later task.

## 8. Definition of V2 alpha complete

V2 alpha is complete when:

- two separate browser contexts can create/join one room;
- empty seats can be filled with AI;
- all four seats play one authoritative game;
- reconnect preserves the correct Human seat;
- hidden information never leaks between players;
- duplicate/retried commands do not execute twice;
- full multiplayer E2E and simulation suites pass;
- the static web client and long-running Node server are deploy-ready;
- V1 LocalGameGateway remains fully operational.
