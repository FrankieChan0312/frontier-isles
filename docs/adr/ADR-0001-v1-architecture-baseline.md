# ADR-0001: V1 Architecture Baseline

- Status: Accepted
- Date: 2026-08-31
- Decision owners: Project owner and architecture assistant

## Context

The project must first deliver a browser-only game for one human and three AI players, then later support real human multiplayer. A direct React-only implementation would be fast initially but would mix rules, UI, AI, and local state, making correctness testing and migration to a server-authoritative multiplayer system expensive.

## Decision

Adopt the following V1 architecture:

- React + TypeScript + Vite
- MUI for application UI
- Raw SVG for board rendering and interaction
- Pure TypeScript authoritative game engine
- Command/result/event contracts
- Explicit phase state machine and pending decisions
- `PlayerView` redaction for hidden information
- Same command path for human and AI players
- Heuristic non-cheating AI
- Seeded deterministic randomness using a versioned serializable algorithm
- `GameGateway` boundary
- `LocalGameGateway` in V1
- Zustand for session/UI state, not domain authority
- Persistence behind a repository interface
- No backend, login, database, or online multiplayer in V1

## Consequences

### Positive

- Rules can be unit-tested without React or a browser
- AI cannot bypass rules by design
- Hidden information has an explicit boundary
- Bugs can be reproduced from seeds and command sequences
- SVG board coordinates do not pollute the domain model
- V2 can add a WebSocket gateway and server engine without replacing the whole UI
- The project demonstrates meaningful software architecture in a portfolio

### Negative

- More up-front types and interfaces
- Some duplication between command, event, state, and view contracts
- Local V1 contains server-like authority concepts before networking exists
- Deterministic RNG and immutable state require discipline

## Alternatives considered

### All state inside React components

Rejected because rules, rendering, and AI would become tightly coupled and difficult to test.

### Canvas/game engine framework

Rejected for V1 because the game is turn-based and SVG provides simpler interaction, accessibility, and responsive scaling.

### Spring Boot from the first release

Rejected because networking, deployment, persistence, and synchronization would slow validation of the core game and AI.

### LLM-based AI

Rejected because game decisions need deterministic, testable, low-latency rule-aware behaviour.

### AI with access to complete local state

Rejected because it would cheat and create a PlayerView redesign during multiplayer migration.
