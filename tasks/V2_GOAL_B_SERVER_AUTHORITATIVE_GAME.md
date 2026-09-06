/goal Implement Frontier Isles V2 Goal B, covering Tasks V2-05 through V2-08, and deliver a complete server-authoritative mixed Human and AI online game milestone.

Work directly in the currently opened repository:

C:\Users\user\Desktop\Fullstack Software Engineering\Project\frontier-isles

Use this branch only:

feat/v2-online-multiplayer

GOAL A ACCEPTED BASELINE

Goal A is already implemented, Human-UAT accepted, committed, and pushed.

Required starting HEAD:

1376451dba5da61b40fb0cb5220c20bdc5826d4b

Accepted Goal A capabilities include:

- Node.js and Socket.IO workspace foundation
- strict versioned realtime contracts
- authoritative in-memory four-seat Rooms
- synchronized Online Lobby
- Human and AI seats
- Ready and Host state
- session resume and reconnect
- newest-valid-resume-wins duplicate-tab handling
- reconnect grace
- Host transfer
- room cleanup
- explicit snapshot resynchronization

Accepted Goal A verification baseline includes:

- root tests: 68 files, 365 tests
- contracts: 5 files, 38 tests
- server: 5 files, 43 tests
- Lobby E2E: 6/6
- full E2E: 14/14
- V1 simulation: 100/100 legal winners
- V1 deterministic simulation hash: 1adc49e8
- clean working tree

Reproducing Goal A tests does not complete Goal B.

Before changing source:

1. Read and follow repository-root AGENTS.md.
2. Read all relevant V1 documentation and ADRs.
3. Read completely:
   - docs/v2/V2_PRODUCT_SCOPE.md
   - docs/v2/V2_ARCHITECTURE_BASELINE.md
   - docs/v2/V2_ROADMAP.md
   - docs/v2/V2_GOAL_A_PROGRESS.md
4. Inspect the accepted Goal A source, shared contracts, Room lifecycle, Lobby gateway, application GameGateway, LocalGameGateway, game engine, AI, PlayerView projection, UI, simulations, and tests.
5. Verify the current branch and exact Goal A HEAD.
6. Run the accepted baseline checks once.
7. Create and maintain:
   docs/v2/V2_GOAL_B_PROGRESS.md
8. Mark V2-05 IN_PROGRESS and immediately begin implementation.
9. Do not return a completion report after preflight.

GOAL B SCOPE

Complete these tasks sequentially:

V2-05 — Extract reusable game packages
V2-06 — Server-authoritative game creation and command execution
V2-07 — SocketGameGateway and online game UI integration
V2-08 — Complete multiplayer workflows and mixed Human/AI seats

Do not implement V2-09 or later.

============================================================
V2-05 — EXTRACT REUSABLE GAME PACKAGES
============================================================

Create and integrate:

packages/game-core
packages/game-ai

Required architecture:

- game-core contains the authoritative game domain:
  - contracts
  - models
  - board topology and board generation
  - deterministic RNG
  - GameState
  - commands and events
  - command router
  - rule engines
  - PlayerView and event projection
  - legal-action projection
  - scoring and invariants

- game-ai contains:
  - deterministic core AI
  - trade AI
  - Merchant, Builder, and Sentinel profiles
  - AI evaluation
  - AI simulation helpers that are appropriate outside browser UI

Dependency direction:

game-ai → game-core

The reverse dependency is forbidden.

game-core must not depend on:

- React
- MUI
- Zustand
- DOM or browser storage
- Socket.IO
- Node HTTP
- Lobby or Room services
- application UI code

game-ai must not depend on:

- React
- MUI
- Zustand
- browser storage
- Lobby UI
- SocketGameGateway

Requirements:

- Refactor by moving the accepted implementation, not rewriting game behavior.
- Update frontend and LocalGameGateway imports to use the packages.
- Preserve the existing V1 Single Player mode.
- Preserve all accepted public domain behavior and deterministic fixtures.
- Do not leave two independent authoritative copies of the Game Engine or AI.
- Compatibility re-exports are permitted only when narrow, temporary, tested, and documented.
- Add independent package typecheck, lint, test, and build boundaries.
- Ensure npm workspaces install and resolve local packages correctly.
- Preserve plain JSON-compatible contracts.
- Preserve the exact V1 deterministic simulation result:

  games: 100
  commands: 65,341
  hash: 1adc49e8

- Preserve all eight accepted V1 browser journeys.
- Preserve every Goal A Lobby workflow.
- Update architecture documentation.
- Add an ADR for shared game package extraction.

V2-05 commit, only after all checks pass:

refactor: extract shared game core and AI packages

============================================================
V2-06 — SERVER-AUTHORITATIVE MULTIPLAYER GAME SESSIONS
============================================================

Enable authoritative online game creation and command execution on the Node server.

ROOM START

Replace the Goal A GAME_START_NOT_AVAILABLE boundary with real start behavior.

Required start validation:

- requester is the current Host
- Room is still in the waiting lifecycle
- at least two Human seats exist
- every required Human is connected
- every Human is Ready
- all four game seats can be resolved to Human or AI players
- no active GameSession already exists
- Room and session state are coherent

Follow existing V2 documents for whether empty seats are rejected or filled by a deterministic/default AI policy. Do not silently contradict the accepted Lobby semantics. If the documents leave this genuinely unspecified, choose the smallest reversible behavior, record it in an ADR, and test it.

SERVER GAME SESSION

Implement a single authoritative GameSession per started Room.

The Server must own:

- authoritative GameState
- GameState version
- game seed and deterministic RNG
- seat-to-PlayerId mapping
- Human SessionId-to-PlayerId mapping
- AI seat profiles
- command execution
- AI orchestration
- PlayerView projection
- redacted event projection
- game lifecycle status
- bounded command-result cache required by the existing roadmap

The browser must never own the authoritative online GameState.

GAME CREATION

- Build GameConfig from the authoritative Room seats.
- Preserve canonical NORTH, EAST, SOUTH, WEST seating.
- Use stable server-owned PlayerIds derived without trusting client input.
- Never use socket.id as PlayerId or durable identity.
- Use server-controlled seed creation with dependency injection for deterministic tests.
- Authoritative game randomness continues through the accepted game-core RNG.
- Network/session cryptographic entropy must remain separate from deterministic game RNG.
- Never use Math.random().
- Start exactly one game for one accepted start request.
- Mark the Room as active and link its GameSession.
- Prevent waiting-Room mutations that are invalid after game start.

WIRE CONTRACTS

Extend packages/realtime-contracts with strict, versioned, runtime-validated online-game contracts.

Use the existing event names and payloads where already frozen. Add only the minimum new game protocol needed for:

- successful Room start acknowledgement
- viewer-specific PlayerView snapshot
- viewer-specific redacted events
- Human game-command submission
- accepted/rejected command acknowledgement
- explicit game snapshot request
- reconnect/resume game resynchronization
- safe game lifecycle notification

A game command sent by the browser may include:

- protocol version
- room/game identity as required
- commandId
- expectedStateVersion
- accepted GameCommand payload

It must not include a trusted actorId.

The Server must derive actorId from:

SessionId
→ authoritative Room seat
→ authoritative game PlayerId

Reject unknown, replaced, disconnected, wrong-Room, or non-Human authority safely.

Do not send stack traces, raw validation errors, GameState, RNG state, development-deck order, opponent resource composition, or hidden Development Card identities.

COMMAND EXECUTION

For each Human command:

1. validate the wire request
2. resolve the authoritative session
3. derive the actor
4. verify Room and GameSession
5. check the command-result cache
6. inject the authoritative actorId
7. execute the shared game-core GameEngine
8. store the result for that session/commandId
9. acknowledge accepted or rejected status
10. publish a fresh viewer-specific PlayerView to every connected Human
11. publish only viewer-safe events
12. run eligible server AI seats until the next Human decision boundary or game over
13. publish the resulting viewer-specific updates

A duplicate commandId from the same authoritative session must return the original result and must not execute twice.

This basic server idempotency boundary is required now. Client retry policy, simultaneous-submission hardening, cache eviction stress, and full delivery guarantees remain V2-09 scope.

SERVER AI

- AI seats execute only on the Server.
- Reuse game-ai.
- AI receives an accepted redacted PlayerView, not unrestricted opponent-private data.
- AI submits the same GameCommand union.
- Use deterministic, bounded orchestration.
- Add a maximum AI-command count and no-progress guard.
- Internal AI command IDs must be deterministic and collision-safe within the GameSession.
- Pause orchestration when a Human response or Human pending decision is required.
- Resume after the relevant Human command.
- Never run online AI in the browser.

PLAYER-SPECIFIC PUBLICATION

For every connected Human:

Authoritative GameState
→ createPlayerView(viewer PlayerId)
→ project viewer-safe events
→ emit only to that Human's authoritative socket/session

Never broadcast one Human's private PlayerView to the entire Socket.IO Room.

GAME START AND COMMAND TESTING

Add focused tests for:

- Host start success
- non-Host start rejection
- fewer than two Humans
- Human not Ready
- disconnected Human
- repeated start
- exact seat-to-player mapping
- actor injection from session
- spoofed actor data rejected or ignored
- stale version
- duplicate command ID executes once
- Human command followed by server AI advancement
- Human pending decision pauses AI
- viewer-specific PlayerView redaction
- per-viewer event redaction
- reconnect obtains current view
- no full GameState or hidden data over the wire
- V1 LocalGameGateway regression

Update documentation and add an ADR.

V2-06 commit, only after all checks pass:

feat: add server-authoritative multiplayer game sessions

============================================================
V2-07 — SOCKET GAME GATEWAY AND ONLINE UI INTEGRATION
============================================================

Implement SocketGameGateway behind the accepted application GameGateway boundary.

Requirements:

- Keep LocalGameGateway fully operational for Single Player.
- Online mode uses SocketGameGateway.
- React components must not call raw Socket.IO events.
- SocketGameGateway owns online-game transport behavior.
- Reuse the accepted Goal A socket/session connection rather than creating competing unauthoritative socket identities.
- Lobby start transitions every connected Human into the same online game.
- Each browser receives its own redacted PlayerView.
- The existing MUI and raw-SVG Game UI renders the online PlayerView.
- Every Human action is submitted to the Server.
- The browser does not execute online commands locally first.
- The browser does not run AI.
- The browser does not mutate online GameState.
- The browser does not persist an authoritative online save in localStorage.
- Goal A sessionStorage resume credentials remain the only private browser credential mechanism in scope.
- Preserve the complete Single Player save/load behavior.

SOCKET GAME GATEWAY

Provide the architectural equivalent of:

- subscribe to online PlayerView updates
- subscribe to viewer-safe game events
- submit GameCommand with commandId and expectedStateVersion
- request authoritative snapshot
- reconnect/resume
- expose connection/resync/submission state
- dispose cleanly

Use the existing application conventions rather than inventing an incompatible duplicate interface.

COMMAND IDS

- Human command IDs must be unique for the browser session and safe for retry/idempotency.
- Do not use Math.random().
- Use a documented browser-safe strategy that does not become game RNG and does not expose credentials.
- Tests must inject deterministic command IDs.
- Do not trust command IDs for identity or authorization.

VERSION AND RESYNC

- On accepted command, render the returned/published authoritative view.
- On stale state, transport recovery, reconnect, missed update, or explicit resync, request a fresh PlayerView.
- Do not attempt to reconstruct authoritative state solely by replaying browser events.
- Ignore superseded out-of-order snapshots by authoritative version/revision policy.
- Surface safe, understandable connection and command errors.

ONLINE UI

- Enable Start Game only when the authoritative Room snapshot says start conditions are satisfied and the viewer is Host.
- On accepted start, all Human clients transition from Lobby to Game.
- Reuse the existing GamePage, board, panels, dialogs, card information, Bank/Supply display, accessibility behavior, and responsive layout.
- Clearly label Online Multiplayer mode.
- Show Room code and connection/reconnecting/resync state without exposing credentials.
- Disable or safely queue Human controls while command acknowledgement/resynchronization is pending.
- Non-acting players see that they are waiting.
- A player facing a private pending decision receives the correct UI controls.
- Other players must not receive that private choice data.

ACTIVE-GAME RESUME

Within the accepted Goal A reconnect grace:

- refresh resumes the same SessionId and seat
- the browser returns to the active online game
- it receives a fresh current PlayerView
- it does not create a duplicate player
- the replaced old tab cannot submit game commands

Do not implement long-disconnect pause/replacement policy; that is V2-10.

TESTING

Add focused tests and Playwright coverage for at least:

- two browsers start from one Lobby
- both transition to the online Game screen
- both see the same public board and turn
- each sees only its own private hand
- first Human performs initial settlement/road through the Server
- other browser updates in real time
- one normal dice/turn lifecycle crosses both browsers
- stale-version rejection causes authoritative resync
- refresh resumes the active game
- duplicate-tab replacement removes old command authority
- Single Player remains functional
- 1440×900, 1024×768, and 480×800 remain usable
- no console or React errors
- no horizontal page overflow
- no opponent-private data in DOM, accessibility text, logs, or wire payloads

Do not add a production debug route or production fixture API solely for E2E.

Update documentation and add an ADR.

V2-07 commit, only after all checks pass:

feat: connect online game gateway to the browser UI

============================================================
V2-08 — COMPLETE MIXED HUMAN AND AI ONLINE GAMEPLAY
============================================================

Verify and complete every accepted Base Game workflow over the real server-authoritative Socket.IO path.

Required online workflows:

- initial setup snake
- settlement placement
- road placement
- dice rolling
- normal resource production
- bank shortage behavior
- discard decisions
- robber movement
- robber target selection
- random theft
- paid roads
- paid settlements
- city upgrades
- Longest Road
- Largest Army
- Development Card purchase
- Knight
- Road Building and free-road completion
- Invention
- Monopoly
- hidden Victory Point cards
- maritime trade
- Human-to-Human domestic trade
- Human-to-AI trade
- AI-to-Human trade
- accept
- reject
- one allowed counter
- victory
- game-over publication

MIXED SEATING MODES

Support and test:

- 2 Humans + 2 AI
- 3 Humans + 1 AI
- 4 Humans

Requirements:

- exactly four authoritative game seats
- at least two Humans
- AI profiles come from authoritative Lobby seats
- all AI actions occur on the Server
- every Human receives only their own PlayerView
- public board and public scores stay synchronized
- private resources and Development Cards remain isolated
- non-current players cannot submit normal turn actions
- only the correct pending responder can answer a trade
- AI orchestration pauses for Human choices and resumes correctly
- victory ends the same authoritative GameSession for every client

TRADING

Verify online negotiation direction and identity carefully:

- Human initiator → Human responder
- Human initiator → AI responder
- AI initiator → Human responder
- Human Counter → original initiator accepts or rejects
- no second counter in the same chain
- no hidden hand information is leaked through disabled controls, errors, acknowledgements, events, DOM, or logs
- accepted trades update every relevant PlayerView atomically

DETERMINISTIC ONLINE GAME TESTING

Add server/integration test harnesses that use only accepted public or internal test boundaries.

Required:

- complete one legal authoritative 2H+2AI game
- complete one legal authoritative 3H+1AI game
- complete one legal authoritative 4H game
- use real GameSession command execution
- use real PlayerView projection
- use real Socket.IO contracts for network integration where practical
- validate state/resource/card/piece/score/RNG invariants after every accepted command
- terminate with one legal winner
- enforce explicit command and turn safety bounds
- output actionable traces on failure
- prove repeated identical test seeds produce identical summaries

Do not add a hidden production endpoint that advances games or installs authoritative fixtures.

BROWSER E2E

Add representative multi-browser E2E covering:

- 2H+2AI Lobby start
- shared initial setup
- normal turn synchronization
- controlled discard/robber workflow through accepted game actions
- paid build
- Development Card interaction
- maritime trade
- Human-to-Human negotiation
- Human-to-AI or AI-to-Human negotiation
- refresh/resume
- victory or a schema-valid test-only path that does not expose a production debug interface

Keep full-game completion primarily in server/integration simulation when browser execution would be unnecessarily long, but every UI command family must have a real online browser path.

HIDDEN-INFORMATION AUDIT

Inspect and test:

- Socket.IO payloads
- PlayerView
- projected events
- acknowledgements
- Room snapshots
- Zustand/application state
- React props
- rendered DOM
- accessibility names and descriptions
- browser console
- server logs
- test traces

No Human may observe:

- another player's resource composition
- another player's unrevealed Development Card types
- development-deck order
- authoritative RNG state
- full GameState
- ResumeToken or token digest
- another SessionId where not already public by accepted contract
- server command cache internals

RECONNECT BOUNDARY

Goal B supports active-game refresh/resume within the existing Goal A reconnect grace.

Do not implement:

- extended active-game pause policy
- AI replacement after grace expiry
- Room/Game database persistence
- server restart recovery

Those are V2-10 and V2-11.

Update all required documentation, Goal B progress, testing instructions, known limitations, and ADRs.

V2-08 commit, only after all checks pass:

feat: complete mixed human and AI online gameplay

============================================================
TASK GATES
============================================================

At the end of each Task V2-05, V2-06, V2-07, and V2-08:

1. Update docs/v2/V2_GOAL_B_PROGRESS.md.
2. Run all relevant focused package checks.
3. Run:

   npm run typecheck
   npm run lint
   npm run test
   npm run build
   npm run check
   npm run check:server
   npm run check:all
   npm run simulate
   git diff --check

4. From V2-07 onward, also run:

   npm run e2e:lobby
   npm run e2e

5. Add any new online-game simulation/E2E scripts required by the implementation and run them.
6. Fix every in-scope failure.
7. Review for:
   - V1 deterministic regression
   - Goal A Lobby regression
   - duplicated authoritative game implementations
   - hidden-information leakage
   - trusted client actor identity
   - socket.id identity misuse
   - state mutation
   - UI rule duplication
   - unauthorized entropy
   - unsafe errors
   - unbounded AI loops
8. Create exactly one passing commit for the Task.
9. Confirm the working tree is clean.
10. Continue automatically to the next Task without waiting for user confirmation.

Do not combine the four Tasks into one commit.

Do not create extra implementation commits unless resolving a genuine post-commit verification defect. If that occurs, explain it and preserve reviewable history.

============================================================
HARD COMPLETION CONDITIONS
============================================================

Goal B is not complete unless all of the following are true:

1. V2-05, V2-06, V2-07, and V2-08 are complete.
2. Exactly four required Goal B commits exist after baseline 1376451, in this order:

   refactor: extract shared game core and AI packages
   feat: add server-authoritative multiplayer game sessions
   feat: connect online game gateway to the browser UI
   feat: complete mixed human and AI online gameplay

3. packages/game-core exists and is the one authoritative game implementation.
4. packages/game-ai exists and is the shared AI implementation.
5. V1 LocalGameGateway and Single Player remain operational.
6. The V1 100-game deterministic hash remains exactly:

   1adc49e8

7. Host can start an eligible online Room.
8. The Server owns the only authoritative online GameState.
9. Human actorId is derived from the resumed server session.
10. The browser never sends a trusted actorId.
11. AI seats execute only on the Server.
12. Every Human receives a distinct redacted PlayerView.
13. Online clients never receive full GameState or hidden opponent data.
14. SocketGameGateway uses the accepted application boundary.
15. Two browsers can start and play the same online game.
16. 2H+2AI, 3H+1AI, and 4H authoritative games legally reach winners in automated testing.
17. Every Base Game command and pending decision works through the online path.
18. Active-game refresh within reconnect grace resumes the same seat and current game view.
19. Goal A Lobby tests continue to pass.
20. All V1 tests and browser journeys continue to pass.
21. Multi-browser online E2E passes without console or React errors.
22. Required viewports have no horizontal overflow.
23. Hidden-information wire and DOM audits pass.
24. docs/v2/V2_GOAL_B_PROGRESS.md marks all four Tasks complete.
25. Final working tree is clean.
26. No V2-09 or later feature is implemented.
27. A final consolidated Goal B report is produced.

The Goal must not be marked complete if:

- only package extraction is finished;
- Start Game remains permanently unavailable;
- the Server broadcasts full GameState;
- actorId is trusted from the client;
- AI still runs authoritatively in an online browser;
- only 2H+2AI works;
- mixed-seat full-game tests do not reach legal winners;
- Goal A or V1 regresses;
- the four required commits do not exist;
- the working tree is dirty.

============================================================
STOPPING RULE
============================================================

Continue automatically through V2-05, V2-06, V2-07, and V2-08.

Stop early only for a genuine blocker such as:

- an irreconcilable contradiction between accepted frozen contracts;
- a destructive operation requiring explicit user authorization;
- an unavailable external credential required for an otherwise impossible action.

Ordinary TypeScript errors, package-resolution problems, failing tests, Socket.IO defects, stale-version defects, AI orchestration defects, hidden-information test failures, browser E2E failures, or performance problems are not blockers. Diagnose and fix them.

Do not ask for confirmation between successful Tasks.

Do not push, merge, tag, deploy, rewrite history, force-push, or modify files outside this repository.

============================================================
FORBIDDEN SCOPE
============================================================

Do not implement:

- V2-09 delivery retry/concurrency hardening beyond the basic command-result cache required by V2-06
- V2-10 long-disconnect pause or AI replacement policy
- V2-11 Room/Game durable persistence or server restart recovery
- V2-12 deployment or online alpha hardening
- Redis
- database
- account login
- Firebase
- public matchmaking
- ranking
- chat
- spectators
- invitations/friends
- multi-instance Socket.IO
- production deployment
- official CATAN artwork or copied protected presentation assets

Do not weaken, remove, skip, quarantine, or mark accepted tests ignored merely to obtain a passing result.

============================================================
FINAL REPORT
============================================================

Return one final Goal B report containing:

1. Final HEAD and branch.
2. The exact four Goal B commits in order.
3. V2-05 package extraction and dependency graph.
4. V2-06 GameSession and server-authority design.
5. V2-07 SocketGameGateway and UI integration.
6. V2-08 complete workflow and mixed-seat coverage.
7. Exact test, simulation, package, server, build, and E2E totals.
8. V1 deterministic hash confirmation.
9. Goal A regression results.
10. 2H+2AI, 3H+1AI, and 4H full-game results.
11. Active-game refresh/resume results.
12. Hidden-information and actor-authority audit.
13. Dependencies added or changed, with reasons.
14. ADRs and documentation created or updated.
15. Known limitations intentionally deferred to Goal C.
16. Explicit confirmation that V2-09 or later was not implemented.
17. Clean-working-tree confirmation.

End the final report with exactly:

GOAL_B_AUTOMATED_ACCEPTANCE_PASSED
PENDING_HUMAN_MULTIPLAYER_GAME_UAT