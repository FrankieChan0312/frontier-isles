/goal Implement Frontier Isles V2 Goal C, covering Tasks V2-09 through V2-12, and deliver a secure, restart-recoverable, deploy-ready online multiplayer alpha.

Work directly in the currently opened repository:

C:\Users\user\Desktop\Fullstack Software Engineering\Project\frontier-isles

Use this branch only:

feat/v2-online-multiplayer

============================================================
ACCEPTED GOAL B BASELINE
============================================================

Goal A and Goal B are already implemented, Human-UAT accepted, committed, and pushed.

Required starting HEAD:

302a951dad3828467c743a20d454198627d9cb8e

Goal B already provides:

- shared packages/game-core
- shared packages/game-ai
- Node.js and Socket.IO server
- strict versioned realtime contracts
- authoritative Room and Lobby lifecycle
- session resume and duplicate-tab replacement
- server-authoritative GameSession
- session-derived actor identity
- server-only AI orchestration
- per-Human redacted PlayerView publication
- SocketGameGateway
- complete online Base Game workflows
- 2 Humans + 2 AI
- 3 Humans + 1 AI
- 4 Humans
- active-game refresh within the existing reconnect grace
- all twenty accepted GameCommand types over the online path

Accepted verification baseline:

- 89 test files
- 529 passing tests
- Online E2E: 13/13
- Goal A Lobby E2E: 6/6
- Full E2E: 27/27
- V1 simulation: 100/100 legal winners
- V1 commands: 65,341
- V1 deterministic summary hash: 1adc49e8
- Goal B online seating-mode runs reach legal winners
- clean working tree

Reproducing Goal B checks does not complete Goal C.

============================================================
MANDATORY READING AND PREFLIGHT
============================================================

Before modifying source:

1. Read and follow repository-root AGENTS.md.
2. Read all relevant V1 architecture, testing, security, persistence, gateway, AI, and deployment documentation.
3. Read completely:
   - docs/v2/V2_PRODUCT_SCOPE.md
   - docs/v2/V2_ARCHITECTURE_BASELINE.md
   - docs/v2/V2_ROADMAP.md
   - docs/v2/V2_GOAL_A_PROGRESS.md
   - docs/v2/V2_GOAL_B_PROGRESS.md
   - docs/v2/V2_GOAL_B_ACCEPTANCE.md
   - every V2 ADR already present
4. Inspect the actual Goal B implementation and tests.
5. Verify the exact branch and starting HEAD.
6. Run the complete Goal B baseline once.
7. Create and maintain:
   docs/v2/V2_GOAL_C_PROGRESS.md
8. Mark V2-09 IN_PROGRESS and immediately begin implementation.
9. Do not return a completion report after preflight.
10. Do not ask for confirmation between successful Tasks.

============================================================
GOAL C SCOPE
============================================================

Complete sequentially:

V2-09 — Delivery guarantees, retry, idempotency, concurrency, and resynchronization
V2-10 — Active-game disconnect, pause, recovery, and AI replacement policy
V2-11 — Recoverable Room and Game persistence across Server restart
V2-12 — Security hardening, multi-browser verification, container/deployment preparation, and V2 alpha release

Do not implement features beyond V2-12.

============================================================
V2-09 — DELIVERY GUARANTEES, RETRY, IDEMPOTENCY,
CONCURRENCY, AND RESYNCHRONIZATION
============================================================

Harden the complete online Human-command delivery path.

The accepted Goal B basic command-result cache is the starting point. Extend it into a fully tested delivery boundary.

CLIENT COMMAND DELIVERY

Implement:

- configurable acknowledgement timeout
- bounded retry count
- bounded retry delay/backoff
- reuse of exactly the same commandId and payload on retry
- one ordered command queue per browser game session
- no parallel mutation submissions from one browser
- visible submission/retry/resync state
- safe cancellation when the session is replaced, leaves, closes, or reaches game over
- explicit snapshot request after an outcome is uncertain
- monotonic PlayerView acceptance
- rejection of older or superseded snapshots
- no optimistic local execution of authoritative online commands

A retry must never create a new commandId.

A browser may retain a bounded tab-scoped command outbox if needed for reload/reconnect reliability, but it must:

- contain no authoritative GameState
- contain no opponent-private data
- be scoped to the current Room, Game, Session, and command
- be cleared after authoritative acknowledgement/resynchronization
- be invalidated after session replacement or Room closure
- never be treated as proof that a command succeeded

SERVER IDEMPOTENCY

For each authoritative Human session, maintain a bounded command-result cache.

The cache must bind:

- SessionId
- GameSession identity
- commandId
- canonical request fingerprint
- authoritative result
- resulting state version
- safe acknowledgement

Required behavior:

- first valid command executes at most once
- exact duplicate commandId and identical payload returns the original result
- exact duplicate does not consume RNG again
- exact duplicate does not mutate state again
- exact duplicate does not rerun AI advancement
- exact duplicate does not broadcast duplicate gameplay effects as a new mutation
- reused commandId with a different payload is rejected with a safe conflict result
- command IDs are never authorization credentials
- cache size and retention are bounded
- cache eviction is deterministic and documented
- one Human cannot replay another Human's cached acknowledgement

CONCURRENCY

Serialize authoritative mutations per GameSession.

Implement the architectural equivalent of a per-GameSession execution queue or mutex.

Requirements:

- never depend on JavaScript callback timing for correctness
- never hold one global lock across unrelated Rooms
- exactly one command/AI mutation pipeline may change one GameSession at a time
- simultaneous valid requests are processed in an explicit order
- after the first accepted mutation, a competing stale command is safely rejected or resynchronized
- AI orchestration must execute inside the same serialized mutation boundary
- no re-entrant AI runner
- no double trade acceptance
- no double Road/Settlement/City build
- no double Development Card purchase/play
- no duplicate discard
- no duplicate Robber move/theft
- no duplicate End Turn
- no negative Bank or resource result

ACKNOWLEDGEMENT LOSS

Test the case:

1. Server accepts a command.
2. The acknowledgement is deliberately dropped or delayed.
3. Client retries with the same commandId.
4. Server returns the original result.
5. State changes exactly once.
6. Client obtains a fresh authoritative PlayerView.

Also test:

- request reaches Server after client timeout
- reconnect happens while a command is unresolved
- duplicate retry occurs after reconnect
- duplicate retry occurs after AI advancement
- stale expectedStateVersion
- response arrives after a newer PlayerView
- old socket attempts to retry after newest-valid-resume replacement
- disconnect during a pending trade
- disconnect during discard
- disconnect during Robber selection
- retry of Accept Trade
- retry of Road Building free-road placement
- retry of End Turn

FORCED RESYNCHRONIZATION

Implement explicit resync when:

- stale version is rejected
- acknowledgement outcome is uncertain
- transport reconnects
- Socket.IO recovery cannot prove continuity
- a view version gap is detected
- a snapshot fails runtime validation
- the browser receives a game identity mismatch

The browser must recover from a fresh authoritative PlayerView, not reconstruct GameState from events.

PROTOCOL AND ERROR SAFETY

Extend realtime contracts only as required.

Use strict runtime validation for:

- retry acknowledgements
- command conflicts
- resync status
- game snapshot responses
- delivery-state notifications

Do not expose:

- cache contents
- request fingerprints
- stack traces
- GameState
- RNG
- hidden hands
- Development Card identities belonging to opponents

TESTING

Add deterministic unit, integration, Socket.IO, and Playwright tests for all required behaviors.

Include simultaneous submissions from:

- the same Human session
- two different Human sessions
- current and non-current players
- two different Rooms, proving no global lock
- valid trade responder and invalid competing responder

No accepted result may be applied twice.

Update documentation and add an ADR.

V2-09 commit, only after all checks pass:

fix: harden multiplayer command delivery and concurrency

============================================================
V2-10 — ACTIVE-GAME DISCONNECT, PAUSE, RECOVERY,
AND AI REPLACEMENT
============================================================

Implement an explicit authoritative active-game presence policy.

ACTIVE GAME LIFECYCLE

Add a network/GameSession lifecycle equivalent to:

- ACTIVE
- PAUSED_RECONNECTING
- PAUSED_REPLACEMENT_REQUIRED
- COMPLETED
- CLOSED

Do not duplicate or replace the accepted game-core GamePhase.

The online GameSession lifecycle is a transport/session concern around GameState.

PAUSE POLICY

For the V2 alpha, use the safe policy:

- when any active Human seat disconnects, the online GameSession pauses
- while paused, no Human game mutation is accepted
- while paused, server AI advancement does not continue
- authoritative GameState and RNG remain unchanged
- public Room/Game presence state is updated
- every connected Human sees who disconnected and the server-authoritative reconnect deadline
- no private hand or pending-choice details are exposed

The existing reconnect grace remains authoritative unless a documented Goal C configuration change is justified and tested.

RECONNECT WITHIN GRACE

A valid resumed Human session within grace must:

- recover the same SessionId
- recover the same seat
- recover the same game PlayerId
- receive a fresh current PlayerView
- preserve resources and Development Cards
- preserve pending decisions
- clear the pause when all required Human seats are connected
- resume AI only after the pause has safely cleared
- prevent the replaced old socket from regaining authority

GRACE EXPIRY

After a Human's reconnect deadline expires:

- mark the seat as requiring a replacement decision
- keep the GameSession paused
- invalidate the expired Human's mutation authority
- do not automatically expose or transfer the hand to another Human
- do not silently continue the game

AI REPLACEMENT

Allow the authoritative current Host to replace an expired disconnected Human seat with an AI.

Requirements:

- replacement is available only after the Server confirms grace expiry
- only the connected authoritative Host may authorize it
- if the Host itself expires, apply a deterministic Host-transfer policy to an eligible connected Human before replacement authorization
- use an explicitly selected AI profile or a documented deterministic default
- the AI takes control of the same game PlayerId and same board position
- the AI receives only that PlayerId's accepted PlayerView
- the AI must not receive unrestricted opponent-private GameState
- online control ownership belongs to GameSession metadata, not socket.id
- avoid changing frozen game-core player contracts solely for transport ownership
- prefer an online controller-assignment overlay if compatible
- publish public replacement metadata to all Humans
- invalidate the original Human's resume authority for that game seat
- replacement is irreversible for the current V2 alpha
- resume the GameSession when no unresolved disconnected Human remains
- resume deterministic server AI orchestration safely

SAFE CLOSURE

Support:

- Host-authorized game closure while replacement is required
- closure when no Human participants remain
- deterministic cleanup after configured idle/abandoned expiry
- clear public reason
- no continued invisible AI-only online match
- no token, hand, state, or stack leakage

UI

Add:

- paused-game banner
- disconnected-player indication
- reconnect countdown
- replacement-required state
- Host-only Replace with AI control
- AI-profile selector where permitted
- Host-only Close Game control
- waiting-for-Host message for non-Host players
- resumed-state confirmation
- accessible live-region announcements
- usable 1440×900, 1024×768, and 480×800 layouts
- no horizontal overflow

TESTING

Add tests for:

- disconnect of current player
- disconnect of non-current player
- disconnect during private pending decision
- disconnect during domestic trade
- reconnect before grace expiry
- reconnect at boundary
- expiry without reconnect
- non-Host replacement rejection
- Host replacement success
- disconnected Host expiry and deterministic Host transfer
- AI replacement continuing the exact same PlayerId
- AI receiving only its redacted PlayerView
- original Human unable to reclaim after replacement
- no AI progress while paused
- AI progress resumes after recovery/replacement
- multiple disconnected Humans
- no connected Humans
- explicit closure
- no private information in pause/replacement snapshots or DOM
- browser refresh
- simulated network loss
- duplicate-tab replacement during pause
- all accepted V1 and Goal A/B flows continue to pass

Update documentation and add an ADR.

V2-10 commit, only after all checks pass:

feat: add active-game reconnect and AI replacement policy

============================================================
V2-11 — RECOVERABLE ROOM AND GAME PERSISTENCE
============================================================

Add recoverable single-process persistence for waiting Rooms and active GameSessions.

REPOSITORY ABSTRACTIONS

Create focused interfaces equivalent to:

- RoomRepository
- GameSessionRepository
- optionally one atomic multiplayer aggregate/unit-of-work boundary when required for consistency

Retain an in-memory adapter for focused tests.

Add exactly one durable single-process production adapter.

STORAGE SELECTION

Do not use Redis or an external managed database.

After inspecting:

- Node.js runtime support
- Windows development
- Linux/Docker deployment
- crash consistency
- transactional needs
- dependency/build risk
- single-process architecture
- persistent-disk availability

choose the smallest robust persistent-disk approach.

Acceptable categories include:

- a supported embedded transactional database
- crash-safe atomic versioned snapshot files

Document the selection and rejected alternatives in an ADR.

Do not ask the user to choose unless an actual irreconcilable requirement exists.

PERSISTED DATA

Persist sufficient authoritative data to restore:

- waiting Rooms
- active Rooms
- Room revisions
- Host session identity
- seats and AI profiles
- Human session identities
- resume-token digests, never raw ResumeTokens
- connected/disconnected lifecycle as recoverable status
- reconnect and expiry deadlines
- active GameSession identity
- authoritative GameState
- seat-to-PlayerId mapping
- Human-to-PlayerId mapping
- AI controller assignment/replacement metadata
- bounded recent idempotency results or sufficient fingerprints/results to prevent an immediate post-restart duplicate effect
- completed/closed status required for cleanup

Do not persist:

- socket.id
- live Socket objects
- Timer handles
- callbacks
- raw ResumeTokens
- IP addresses unless a documented security requirement proves necessary
- React/Zustand state
- browser DOM data

VERSIONED FORMAT

Implement:

- explicit persistence schema version
- strict runtime validation
- rejection of unknown future schema versions
- deterministic serialization
- no Date instances inside persisted domain payloads
- integer epoch deadlines where required
- clear upgrade boundary
- checksum/integrity protection where appropriate
- safe handling of partial/corrupt records

CRASH SAFETY

The durable adapter must use either:

- transactional commit semantics

or:

- write temporary data
- flush as supported
- atomically replace the accepted snapshot
- retain a recoverable previous generation where appropriate

Do not overwrite the only good copy with invalid data.

SERVER STARTUP RECOVERY

On restart:

1. Load and validate stored Rooms and GameSessions.
2. Restore valid waiting Rooms.
3. Restore valid active games with exact GameState and RNG.
4. Treat prior socket connections as disconnected.
5. Pause restored active games awaiting Human resume.
6. provide a documented restart-recovery resume window
7. permit existing tab-scoped ResumeTokens to authenticate against persisted token digests
8. publish fresh authoritative Room and PlayerView snapshots after resume
9. resume only when presence/replacement requirements are satisfied
10. clean expired Rooms and games deterministically

SERVER SHUTDOWN

Graceful shutdown must:

- stop accepting new mutations
- drain or stop the per-GameSession command queue safely
- flush all accepted state
- close Socket.IO and HTTP cleanly
- preserve recoverable data

An interrupted shutdown must not corrupt the last accepted durable state.

PERSISTENCE TIMING

Persist after every accepted authoritative mutation affecting:

- Room
- session lifecycle
- GameSession
- GameState
- command idempotency record
- replacement/closure status

Do not acknowledge a mutation as durably accepted until the chosen durability boundary has succeeded, unless the ADR explicitly defines and tests another safe acknowledgement model.

FAIL-CLOSED BEHAVIOR

For malformed or corrupt persistence:

- do not deserialize arbitrary class/function data
- do not crash-loop without actionable operator output
- do not silently load malformed state
- do not silently reset a corrupt active game as a fresh game
- quarantine or isolate invalid records safely
- continue loading unrelated valid records where technically safe
- expose only public-safe errors to clients
- retain actionable server logs without secrets

RESTART TESTS

Use temporary directories or temporary embedded stores.

Test:

- waiting Room survives restart
- active game survives restart
- exact GameState version preserved
- exact RNG preserved
- exact private resources/cards preserved only for their owner
- Room revision preserved
- Host/session/seat mapping preserved
- ResumeToken digest verification works after restart
- raw token was never persisted
- active game restores paused
- Humans resume and continue
- duplicate command retry after restart does not double-execute
- pending discard survives
- pending Robber decision survives
- pending domestic trade survives
- AI replacement metadata survives
- completed game survives or cleans up according to policy
- expired Room is removed
- corrupted record is rejected
- unsupported future version is rejected
- truncated/interrupted write preserves the previous valid state
- graceful shutdown flushes
- V1 Single Player remains entirely independent

Update documentation and add an ADR.

V2-11 commit, only after all checks pass:

feat: add recoverable multiplayer room persistence

============================================================
V2-12 — SECURITY HARDENING, MULTI-BROWSER E2E,
DEPLOYMENT PREPARATION, AND V2 ALPHA RELEASE
============================================================

Harden the complete V2 online alpha.

SECURITY

Implement and verify:

- strict environment validation
- production CORS allowlist
- no wildcard credentialed CORS
- explicit Origin validation for Socket.IO and HTTP where applicable
- HTTP and Socket.IO payload-size limits
- strict runtime schema validation
- bounded Room creation rate
- bounded Join attempts
- bounded resume attempts
- bounded command submissions
- per-session/per-transport rate limiting appropriate to a single-process alpha
- safe rate-limit acknowledgements
- nickname normalization and length limits
- RoomCode validation
- command payload depth/size protection
- no prototype-pollution acceptance
- no raw validation internals over the wire
- no stack traces to clients
- no secret/token logging
- structured log redaction
- production-safe error boundary
- dependency audit
- graceful shutdown
- persistence flush
- liveness endpoint
- readiness endpoint
- readiness reflects persistence/startup recovery status
- no unauthorized debug or fixture endpoint

Never trust:

- client actorId
- client PlayerId
- client seat authority
- client Host claim
- client resource count
- client legal actions
- client game result
- client RNG
- client Room revision as authoritative state

HIDDEN-INFORMATION AUDIT

Audit:

- RoomSnapshot
- PlayerView
- projected events
- acknowledgements
- retries
- idempotency results
- persistence records exposed to clients
- Zustand/application state
- React props
- DOM attributes
- accessibility text
- browser console
- server logs
- Playwright traces
- test reports

No Human may observe:

- another player's resource composition
- another player's unrevealed Development Card identities
- Development deck order
- authoritative GameState
- RNG state
- command cache contents/fingerprints
- raw ResumeToken
- token digest
- unauthorized SessionId
- server storage path
- private pending-decision composition belonging to another player

MULTI-BROWSER E2E

Run real Socket.IO and Browser paths.

Cover at minimum:

- 2 Humans + 2 AI
- 3 Humans + 1 AI
- 4 Humans
- Room creation and Join
- Ready and Start
- complete initial setup synchronization
- normal turn
- discard and Robber
- paid building
- Development Card
- maritime trade
- Human-to-Human trade
- Human-to-AI trade
- AI-to-Human trade
- one allowed Counter
- victory
- acknowledgement loss and retry
- same commandId exact replay
- same commandId conflicting payload
- simultaneous submissions
- forced resync
- refresh resume
- duplicate-tab replacement
- disconnect countdown
- reconnect within grace
- grace expiry
- Host-authorized AI replacement
- original Human denied after replacement
- Server restart
- resume after Server restart
- pending-decision recovery after restart
- persistence corruption rejection
- Room cleanup

No production-only test fixture API or hidden debug mutation route may be added.

LOAD AND RESOURCE SMOKE

Add a bounded local single-process load smoke test covering representative concurrent:

- waiting Rooms
- active GameSessions
- Socket.IO clients
- snapshot publications
- command submissions
- reconnects

The test must:

- use explicit safety limits
- avoid claiming production-scale capacity
- report commands, Rooms, sockets, duration, and memory observations
- detect listener leaks
- detect unbounded cache growth
- detect unresolved timers/handles
- verify unrelated Rooms progress independently

DEPLOYMENT REFERENCE

Prepare a deployable single-process reference architecture with persistent disk.

Provide:

- production multi-stage Dockerfile
- .dockerignore
- non-secret production environment example
- persistent data-volume configuration
- healthcheck
- graceful stop configuration
- documented WebSocket reverse-proxy requirements
- documented trusted-proxy assumptions where applicable
- documented frontend realtime URL configuration
- documented same-origin or split-origin deployment decision
- local production smoke command
- restart-recovery smoke command
- backup and restore instructions
- log location/rotation guidance
- upgrade/rollback guidance
- clear statement that one process is supported
- clear statement that multiple replicas are not supported without a future shared adapter/coordination design

Choose the smallest coherent reference deployment.

A single image serving both the built frontend and Socket.IO server is acceptable if it preserves the architecture and is documented.

A split static frontend plus one long-running Node server is also acceptable.

Do not deploy to an actual account, request credentials, push images, create cloud resources, or expose secrets.

ALPHA VERSION AND DOCUMENTATION

Prepare the repository as:

Frontier Isles V2 Online Multiplayer Alpha

Use an appropriate prerelease version such as:

2.0.0-alpha.1

only if consistent with the current package/versioning structure.

Add or update:

- README
- V2 architecture
- protocol documentation
- testing documentation
- security documentation
- persistence/recovery runbook
- deployment documentation
- known limitations
- release checklist
- Human UAT checklist
- Goal C progress report
- final Goal C acceptance evidence
- ADRs for security/deployment decisions

KNOWN LIMITATIONS MUST STATE

- single Node process only
- persistent local disk required by the selected adapter
- no Redis/multi-instance ownership
- no login/accounts
- anonymous Room participants
- no matchmaking
- no chat
- no spectators
- no rankings
- no moderation system
- no cross-region scaling
- no guarantee of continued game availability if the host machine or persistent volume is permanently lost
- alpha status

FINAL CLEAN VERIFICATION

Run from a clean dependency install:

npm ci

Then run every existing and new required script, including the architectural equivalents of:

npm run typecheck
npm run lint
npm run test
npm run build
npm run check
npm run check:server
npm run check:all
npm run simulate
npm run simulate:online
npm run e2e:lobby
npm run e2e:online
npm run e2e
npm audit
git diff --check

Also run:

- restart-recovery integration suite
- delivery/concurrency suite
- disconnect/replacement suite
- persistence corruption suite
- load smoke
- production/container smoke

Fix every in-scope failure.

V2-12 commit, only after all checks pass:

chore: harden and prepare online multiplayer alpha

============================================================
TASK GATES
============================================================

At the end of V2-09, V2-10, V2-11, and V2-12:

1. Update docs/v2/V2_GOAL_C_PROGRESS.md.
2. Add focused tests and regression tests.
3. Update required documentation.
4. Add an ADR for material architecture decisions.
5. Run all package, server, simulation, and applicable browser checks.
6. Run git diff --check.
7. Review for:
   - V1 deterministic regression
   - Goal A Lobby regression
   - Goal B gameplay regression
   - duplicate command effects
   - cross-Room blocking
   - hidden-information leakage
   - trusted client authority
   - socket.id identity misuse
   - raw token persistence/logging
   - unbounded queues/caches/timers
   - non-atomic persistence
   - unsafe public errors
   - UI rule duplication
   - unauthorized entropy
8. Fix all failures within scope.
9. Create exactly one passing commit for that Task.
10. Confirm the working tree is clean.
11. Continue automatically to the next Task.

Do not combine the four Tasks into one commit.

Do not rewrite, amend, rebase, reset, or force Goal A or Goal B history.

A later Task may repair an earlier Goal C implementation defect inside its own commit, but the final report must identify the repair.

============================================================
REQUIRED GOAL C COMMITS
============================================================

Exactly four normal Goal C commits must follow baseline 302a951, in this order:

1. fix: harden multiplayer command delivery and concurrency
2. feat: add active-game reconnect and AI replacement policy
3. feat: add recoverable multiplayer room persistence
4. chore: harden and prepare online multiplayer alpha

============================================================
HARD COMPLETION CONDITIONS
============================================================

Goal C is not complete unless all of the following are true:

1. V2-09, V2-10, V2-11, and V2-12 are complete.
2. The four required Goal C commits exist in the required order.
3. docs/v2/V2_GOAL_C_PROGRESS.md marks all four Tasks complete.
4. Exact duplicate commands execute at most once.
5. Reused commandId with different payload is rejected.
6. Human command mutations are serialized per GameSession.
7. Different Rooms do not share one global mutation lock.
8. Lost acknowledgements and retries recover safely.
9. Stale/missing views trigger authoritative resynchronization.
10. Active games pause safely on Human disconnect.
11. Reconnect within grace restores the same seat and PlayerId.
12. Grace expiry creates a replacement-required state.
13. Only the authoritative connected Host can approve AI replacement.
14. AI replacement controls the same PlayerId without opponent-private access.
15. Expired replaced Human authority cannot mutate the game.
16. Waiting Rooms survive Server restart.
17. Active games survive Server restart.
18. Exact GameState and RNG survive Server restart.
19. Existing resume credentials can authenticate after restart through persisted digests.
20. No raw ResumeToken is persisted.
21. A recent duplicate command cannot double-execute immediately after restart.
22. Corrupted persistence fails closed.
23. Graceful shutdown flushes accepted state.
24. Security/rate-limit validation passes.
25. Hidden-information wire, DOM, accessibility, logs, traces, and persistence exposure audits pass.
26. 2H+2AI, 3H+1AI, and 4H online paths pass.
27. Retry, concurrency, disconnect, replacement, and restart E2E paths pass.
28. Load smoke passes within explicit alpha bounds.
29. Production/container smoke passes.
30. V1 Single Player remains fully operational.
31. Goal A Lobby remains fully operational.
32. Goal B online gameplay remains fully operational.
33. V1 100-game deterministic hash remains exactly:

    1adc49e8

34. No accepted tests were deleted, weakened, skipped, quarantined, or ignored.
35. No unauthorized production debug/fixture route exists.
36. Deployment documentation and persistent-volume configuration exist.
37. The final working tree is clean.
38. A complete final Goal C report is produced.
39. No post-V2-alpha product feature was added.
40. Nothing was pushed, merged, tagged, or deployed.

The Goal must not be marked complete when only tests pass but:

- restart recovery is absent
- retries can double-execute
- active-game disconnect remains undefined
- AI replacement leaks private state
- persistence stores raw ResumeTokens
- persistence is not crash-safe
- Server restart loses active games
- container/deployment smoke was not performed
- any required Goal C commit is absent
- the working tree is dirty

============================================================
STOPPING RULE
============================================================

Continue automatically through V2-09, V2-10, V2-11, and V2-12.

Stop early only for a genuine blocker such as:

- an irreconcilable contradiction between accepted frozen contracts
- a destructive operation requiring explicit user authorization
- a required external credential for an otherwise impossible operation

No live deployment is required, so absence of cloud credentials is not a blocker.

Ordinary TypeScript errors, dependency issues, failing tests, retry defects, concurrency defects, persistence defects, Socket.IO failures, Browser E2E failures, container failures, performance issues, or security-test failures are not blockers. Diagnose and fix them.

Do not ask for confirmation between successful Tasks.

Do not push, merge, tag, publish packages, publish images, deploy, rewrite history, force-push, or modify files outside this repository.

============================================================
FORBIDDEN SCOPE
============================================================

Do not add:

- account login
- Firebase authentication
- public matchmaking
- rankings
- chat
- spectators
- friends/invitations
- moderation
- payments
- 5–6 player rules
- expansions
- Redis
- multiple Socket.IO server instances
- distributed locks
- cross-region deployment
- Kubernetes
- production cloud resources
- official CATAN artwork or copied protected assets

Do not move V1 Single Player authority to the Server.

Do not remove LocalGameGateway.

Do not make online browsers authoritative.

Do not weaken accepted deterministic or hidden-information boundaries.

============================================================
FINAL REPORT
============================================================

Return one consolidated Goal C report containing:

1. Final branch and full HEAD.
2. The exact four Goal C commits in order.
3. V2-09 retry/idempotency/concurrency design and results.
4. V2-10 disconnect/pause/replacement policy and results.
5. V2-11 storage selection, schema, crash-safety, and restart recovery.
6. V2-12 security and deployment architecture.
7. Exact package, frontend, game-core, game-ai, contracts, server, integration, simulation, E2E, load, and container test totals.
8. V1 deterministic hash confirmation.
9. Goal A regression results.
10. Goal B regression results.
11. 2H+2AI, 3H+1AI, and 4H results.
12. Lost-acknowledgement and duplicate-command evidence.
13. Simultaneous-submission evidence.
14. Disconnect/reconnect/AI-replacement evidence.
15. Server-restart and pending-decision recovery evidence.
16. Persistence corruption and rollback evidence.
17. Hidden-information and token-redaction audit.
18. Rate-limit and security audit.
19. Deployment commands and exact boundary.
20. Dependencies added or changed, with reasons.
21. ADRs and documentation created or updated.
22. Known alpha limitations.
23. Explicit confirmation that nothing was pushed, merged, tagged, or deployed.
24. Clean-working-tree confirmation.

End the final report with exactly:

GOAL_C_AUTOMATED_ACCEPTANCE_PASSED
PENDING_HUMAN_DEPLOYMENT_UAT