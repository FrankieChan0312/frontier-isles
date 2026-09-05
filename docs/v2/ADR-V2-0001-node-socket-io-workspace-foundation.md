# ADR-V2-0001: Node and Socket.IO Workspace Foundation

- Status: Accepted
- Date: 2026-09-04
- Scope: V2-00

## Context

Frontier Isles must add a long-running realtime boundary without moving or regressing the accepted
browser-only V1 application. The foundation needs independently testable HTTP, Socket.IO,
configuration, and shared-contract packages while deliberately excluding Room and game behavior.

## Decision

- Require Node.js 24 LTS (`>=24 <25`) and npm workspaces while retaining the V1 frontend at root.
- Add private `@frontier-isles/server` and `@frontier-isles/realtime-contracts` workspaces.
- Use Node `http` and Socket.IO 4.x on one HTTP server; do not add Express or another web framework.
- Use `tsx` only for local server development and `socket.io-client` only for integration tests at
  this stage.
- Parse `PORT`, `CLIENT_ORIGIN`, and `NODE_ENV` once in the process entrypoint. Credentialed CORS
  accepts only the validated configured origin and never a wildcard.
- Limit the shared package to protocol/service identity and the health contract in V2-00. Room,
  session, lobby, and game contracts begin in their dedicated later Goal A stages.
- Keep network process concerns out of `src/game/**`; no deterministic engine source or RNG changes.

## Consequences

The static V1 build and its LocalGameGateway remain available through the root web scripts, while
server/contracts checks can run independently or through `check:all`. Two terminals are sufficient
for local web/server development, avoiding another process-manager dependency. Deployment and Room
behavior remain outside this foundation.
