# Frontier Isles — Browser V1 Completion Goal

## Baseline

This goal begins only after Task 11 has been accepted and committed.

Accepted baseline:

- Tasks 00–11 complete
- 1 Human + 3 AI target
- Browser-only V1
- React + TypeScript + Vite
- MUI + Roboto for application UI
- Raw SVG for the board
- Pure TypeScript authoritative game engine
- Immutable state transitions
- `BASE_4P_COMBINED_ACTION_V1`
- `XORSHIFT32_V1`
- Standard 19-tile / 54-vertex / 72-edge board
- Deterministic setup, turns, production, robber, building, scoring, development cards, and trading
- 35 test files / 261 passing tests at the Task 11 report boundary
- No backend, networking, authentication, database, or online multiplayer

The goal is to complete Stages 12–17 and deliver a local, deploy-ready browser V1 release candidate.

---

## Product outcome

A user can open the site in a browser and play a complete four-player base game as one Human against three non-cheating AI players.

The release candidate must support:

1. New game creation with a displayed seed
2. Full initial-placement snake
3. Normal dice and production turns
4. Seven/discard/robber/theft workflow
5. Roads, settlements, and cities
6. Development cards
7. Longest Road, Largest Army, scoring, and victory
8. Domestic and maritime trading
9. AI-controlled opponents
10. Save, load, restart, delete save, and new game
11. Responsive MUI + SVG UI
12. Deterministic simulations and repeatable E2E verification
13. Production static build and deployment documentation

Online multiplayer is not part of this goal.

---

## Frozen constraints

1. Read and follow repository-root `AGENTS.md` and all relevant `docs/` files.
2. Preserve accepted Task 00–11 behavior, public contracts, golden anchors, and invariants.
3. Do not change the frozen ruleset or RNG algorithm.
4. Do not modify the Task 01 `GameCommand`, `GameEvent`, `RuleViolation`, or core state contracts merely for UI convenience.
5. If an accepted-contract contradiction cannot be resolved without changing a frozen contract, stop and report the exact contradiction.
6. Authoritative game logic remains under `src/game/**` and must not depend on React, MUI, Zustand, browser storage, or application code.
7. React components must never mutate authoritative state or decide legality.
8. Human and AI actors submit the same accepted commands.
9. AI receives a redacted `PlayerView`; it must not inspect full opponent hands or hidden development-card identities.
10. Production code under `src/game/**` must not use `Math.random`, Web Crypto entropy, UUID entropy, timestamps, wall-clock entropy, locale-dependent ordering, or hidden mutable RNG.
11. Authoritative randomness must use the accepted seeded RNG.
12. AI deliberation should use deterministic scoring and code-unit tie-breaks by default. It must not consume authoritative game RNG merely to choose between equivalent actions.
13. If an explicit AI policy RNG is introduced, it must be separate, serializable, deterministic, injected, persisted, tested, and documented.
14. Do not use official CATAN names in the product title, logos, artwork, card art, copied rulebook prose, or other protected presentation assets.
15. Do not add a backend, WebSocket, Firebase, login, lobby, chat, database, or online multiplayer.
16. Do not weaken, skip, delete, quarantine, or mark accepted tests as ignored to make checks pass.
17. Do not rewrite Git history, force-push, delete accepted work, or modify files outside the repository.
18. Do not publish or expose credentials. Live deployment is allowed only when an already-authorized configuration makes it safe; otherwise leave the repository deploy-ready.

---

## Long-run execution protocol

Create and maintain:

```text
docs/V1_COMPLETION_PROGRESS.md
```

It must record:

- baseline branch and HEAD
- current stage
- short design decisions
- files changed
- verification results
- commit hash for each completed stage
- unresolved risks
- next stage

Work sequentially through Stages 12–17.

For each stage:

1. Inspect accepted code and tests before editing.
2. Write the stage plan into the progress log.
3. Implement only that stage and necessary integrations.
4. Add focused tests and regression tests.
5. Update relevant docs.
6. Add an ADR for material architecture decisions.
7. Run:
   - `npm run typecheck`
   - `npm run lint`
   - `npm run test`
   - `npm run build`
   - `npm run check`
   - `git diff --check`
8. Review the diff for:
   - frozen-contract drift
   - hidden-information leaks
   - duplicated rule logic
   - mutation
   - forbidden entropy
   - UI/domain boundary violations
9. Fix all failures within scope.
10. Update the progress log.
11. Create exactly one descriptive Git commit for the completed stage.
12. Confirm the working tree is clean.
13. Continue automatically to the next stage without waiting for user confirmation.

Never commit failing or knowingly incomplete stage work.

Transient worker-start timeouts may be retried once without code changes. If they persist, diagnose them; do not hide assertion failures or reduce test coverage.

Subagents may be used for read-only code review, test review, browser review, accessibility review, or other independent investigation. Do not allow parallel agents to write to the same working tree unless separate worktrees are used and changes are deliberately integrated by the main agent.

---

# Stage 12 — Unified Game Engine, Player Views, Event Redaction, and Legal Actions

## Objective

Expose one authoritative application-facing engine boundary that routes all accepted commands and produces viewer-specific state without duplicating rule logic.

## Required architecture

Provide the architectural equivalents of:

```ts
interface GameEngine {
  createGame(config: GameConfig, seed: string): GameState;
  execute(state: GameState, envelope: CommandEnvelope): EngineResult;
  createPlayerView(state: GameState, viewerId: PlayerId): PlayerView;
}
```

A class is optional; functions implementing the same boundary are acceptable.

## Command routing

Route every accepted command to its existing focused executor:

- setup
- roll/end turn
- discard/robber/theft
- paid building
- development-card lifecycle
- domestic and maritime trading

Requirements:

- exhaustive discriminated-union routing
- no duplicated rule behavior
- preserve established executor validation precedence
- one version increment per successful command
- ordinary invalid commands return accepted rule violations
- corrupt authoritative states fail with actionable errors
- deterministic integration replay through the unified boundary

## PlayerView

The viewer may see:

- exact own resources
- exact own development cards
- own controller and profile
- complete public board state
- public player identity/controller data
- opponent resource-card count only
- opponent development-card count only
- public victory points
- awards, played Knight count, public buildings, roads, and ports
- current turn, phase, last roll, winner, and appropriate pending decisions
- legal actions for the viewer

The viewer must not see:

- opponent resource types or quantities
- opponent in-hand development-card identities
- opponent hidden Victory Point cards
- private choice details belonging only to another actor
- raw authoritative `GameState`

Add a viewer-specific event projection, for example `PlayerEventView`, without changing the accepted `GameEvent` union. Redact sensitive event fields when the viewer is not entitled to see them. In particular, a theft event must not reveal the stolen resource to uninvolved players.

## Legal-action projection

Do not enumerate impractically large Cartesian products. Expose authoritative capabilities and bounded choices:

- current permitted command types
- legal initial-settlement vertices
- legal initial-road edges
- whether rolling or ending the turn is legal
- discard requirement plus the viewer's own available resources
- legal robber destination tiles
- legal robber target players
- legal paid/free road edges
- legal settlement vertices
- legal city-upgrade vertices
- affordable development-card purchase capability
- playable owned development-card IDs
- legal Invention resource choices based on bank availability
- legal Monopoly resource types
- legal maritime give/receive options and authoritative ratios
- legal domestic-trade counterparties and negotiation response capability
- pending trade data redacted appropriately

Reuse accepted rule validators and selectors. Do not create UI-only approximations of legality.

## Acceptance

- all accepted commands route successfully
- exhaustive router test
- no private information leaks through `PlayerView`, event views, errors, logs, or legal actions
- deterministic replay through the unified engine
- existing 261 tests remain accepted

Stage commit:

```text
feat: add unified game engine and redacted player views
```

---

# Stage 13 — Deterministic Core AI

## Objective

Create one non-cheating deterministic heuristic AI that can legally complete games without domestic-trade strategy.

## AI boundary

Provide the architectural equivalent of:

```ts
interface AiAgent {
  chooseNextCommand(
    view: PlayerView,
    context: AiDecisionContext,
  ): Promise<GameCommand>;
}
```

The orchestrator creates the envelope. The AI receives `PlayerView`, not `GameState`.

## Required decisions

The AI must handle:

- initial settlement
- initial road
- roll dice
- required discard
- robber destination
- robber target
- paid road
- paid settlement
- city upgrade
- development-card purchase
- Knight
- Road Building and free-road completion
- Invention
- Monopoly
- maritime trade
- end turn
- incoming domestic trade with a safe deterministic reject policy for this stage

## Heuristics

Include deterministic scoring for:

- number-token production probability
- resource diversity
- resource scarcity
- expected resource income
- immediate build unlocks
- settlement expansion
- port value
- city value
- Longest Road opportunity
- Largest Army opportunity
- visible opponent threat
- current and projected victory points

Use stable code-unit ordering as the final tie-break.

## Safety

- maximum commands per turn
- maximum commands per game
- no-progress detector
- repeated-state/command-loop detector
- actionable trace on failure
- invalid AI output fails safely
- no authoritative state mutation
- no hidden-information access
- no use of authoritative game RNG for thinking

## Simulation

Add:

- focused decision fixtures
- at least 16 deterministic all-AI smoke games in normal tests
- a separate simulation command suitable for a larger corpus
- every smoke game must end with a legal winner within a documented safety bound
- assert authoritative invariants after every accepted command

Stage commit:

```text
feat: add deterministic core AI player
```

---

# Stage 14 — Trade AI and AI Personalities

## Objective

Teach AI players to initiate and negotiate domestic trades using only viewer-visible information.

## Trade evaluation

Use dynamic marginal resource values based on:

- current build goal
- immediate build unlock
- resource production rate
- board-wide scarcity
- controlled ports
- seven/discard risk
- hand surplus
- public opponent score and threat
- visible Longest Road/Largest Army pressure
- estimated opponent benefit, never secret hand knowledge

Evaluate:

```text
own incoming value
- own outgoing value
+ build unlock
+ port/scarcity adjustment
- estimated opponent gain × threat weight
+ personality adjustment
```

## Behavior

- accept, reject, or counter incoming offers
- initiate useful offers in AI Action phases
- AI-to-AI trade
- AI-to-Human offer through normal pending-trade state
- no gift, fake, credit, or illegal offer generation
- no repeated identical proposal in one turn
- maximum two initiated negotiations per AI turn
- maximum one counter as frozen by engine contract
- terminate negotiation loops
- do not knowingly enable a visible leader's immediate win without exceptional compensation
- stable deterministic tie-breaks

## Profiles

Implement three profiles on the same engine:

- `MERCHANT`: lower acceptance threshold, more trade attempts
- `BUILDER`: production, settlements, expansion, cities
- `SENTINEL`: visible-leader blocking and defensive trading

Profiles change weights, not rules.

## Simulation

- deterministic trade fixtures
- AI-to-AI and AI-to-Human pending-offer tests
- at least 24 fixed-seed games covering all three profiles in normal tests or a bounded smoke suite
- larger simulation command includes mixed profiles and invariant checks

Stage commit:

```text
feat: add trade AI and player personalities
```

---

# Stage 15 — LocalGameGateway, AI Orchestration, Zustand, and Persistence

## Objective

Create the browser application boundary while keeping authoritative state private to the gateway.

## Required components

- `GameGateway` interface
- `LocalGameGateway`
- viewer subscriptions
- redacted event subscriptions
- command submission with `expectedStateVersion`
- AI-turn orchestration
- human-interaction boundaries
- AI-thinking status
- save status
- recoverable error status
- game-session Zustand store
- separate UI-interaction Zustand store
- persistence repository abstraction
- localStorage implementation
- in-memory test implementation

## Authority boundary

The gateway privately owns authoritative `GameState`.

Zustand may store:

- current Human `PlayerView`
- recent redacted events
- connection/session status
- AI-thinking status
- save status
- user-facing error
- UI selections, modes, zoom, and dialogs

Zustand must not independently store or mutate authoritative resources, ownership, scoring, legality, or hidden opponent state.

## AI loop

- run AI actors until a Human decision is required or game ends
- support non-current AI trade responses
- pause for AI-to-Human offers
- continue after Human accepts/rejects/counters
- command and no-progress safety limits
- deterministic command IDs/counters
- do not use random UUIDs
- preserve expected state versions
- publish accepted events in order

## Save format

Use a versioned plain-JSON save envelope containing the minimum needed to resume deterministically:

- authoritative game state
- Human player ID
- AI profile assignments
- application/orchestration state needed for deterministic continuation
- save schema version
- display seed
- optional redacted event history

Requirements:

- defensive parse
- schema/invariant validation
- reject unsupported versions cleanly
- corrupted saves do not crash the app
- autosave after accepted transitions
- manual save/load/delete
- reload resumes a valid game
- no hidden data enters UI store even though local persistence contains authoritative state

A user-facing generated seed may use an injectable application-level seed factory outside `src/game/**`. If Web Crypto is used, the generated seed must be immediately materialized, displayed, stored, and passed as an explicit seed; no hidden entropy may enter the engine. Tests must inject deterministic seed factories.

Stage commit:

```text
feat: add local game gateway and browser persistence
```

---

# Stage 16 — Complete Interactive MUI + SVG Game UI

## Objective

Replace the static preview with a complete playable browser interface.

## Screens

### Home / New Game

- Frontier Isles title
- Human name
- seed input
- Generate Seed
- start game
- continue saved game when available
- delete saved game
- concise original rules/help

### Game

- responsive SVG board
- terrain styling
- number tokens
- robber
- ports
- roads
- settlements
- cities
- legal hover/focus/click targets
- current player and phase
- player panels
- own resource cards
- opponent public card counts
- public scores and awards
- last dice roll
- action controls
- event/game log
- AI-thinking indicator
- save/restart/new-game controls

## Human workflows

- initial settlement and road
- roll dice
- discard resources
- move robber and select victim
- build road/settlement/city
- buy/play development cards
- select Invention resources
- select Monopoly resource
- place Road Building roads or finish legal dead end
- maritime trade
- propose domestic trade to an AI
- accept/reject/counter AI offers
- resolve AI counter-offers
- end turn
- victory dialog and new game

## UI rules

- MUI for application controls, dialogs, panels, feedback, and layout
- raw SVG for board and pieces
- Roboto typography
- no direct authoritative mutation
- no legality logic in components
- render only `PlayerView` and redacted events
- no hidden opponent information in DOM, props, accessibility text, console, error messages, React DevTools-oriented debug props, or game log
- keyboard-operable controls where practical
- visible focus states
- dialog focus management
- accessible names
- sufficient contrast
- reduced-motion support
- desktop-first but usable at tablet and 480px width
- no horizontal page overflow at 480px
- original CSS/SVG visuals only
- no official CATAN assets or copied presentation

Do not add a routing dependency unless it materially improves this two-screen application. A simple application screen state is acceptable.

## Browser verification

Run the app and inspect actual behavior at approximately:

- 1440 × 900
- 1024 × 768
- 480 × 800

Fix:

- console errors
- React warnings
- hidden-data leakage
- clipped dialogs
- board interaction problems
- inaccessible controls
- overflow
- broken save/reload behavior

Stage commit:

```text
feat: add complete interactive game interface
```

---

# Stage 17 — Release Hardening, Simulation, E2E, and Deploy-Ready Build

## Objective

Prove the complete V1 works and leave a clean static release candidate.

## Simulation suite

Provide:

```text
npm run simulate
```

Requirements:

- at least 100 fixed seeds
- mixed AI profiles
- invariant checks after every command
- legal winner in every run within a documented turn/command bound
- deterministic summary
- failure trace containing seed, state version, turn, phase, actor, command, and violation/error
- resource, card, piece, board, score, award, state-version, and RNG invariants throughout
- no infinite loops

Keep the ordinary test suite reasonably fast; the larger corpus may run separately.

## E2E

Prefer Playwright if a repeatable browser suite is practical. Add it only in this stage and document the dev dependency and browser installation command.

Required paths:

1. create a seeded game
2. complete Human setup interactions
3. roll and end a turn
4. perform a legal build
5. resolve a controlled seven
6. perform a maritime trade
7. negotiate with AI
8. save and reload
9. reach or load a deterministic valid victory state
10. start another game

E2E may inject a schema-valid save fixture through browser storage for long setup paths, provided:

- fixtures are built using accepted engine helpers
- no production backdoor or debug API is added
- production bundle does not expose hidden testing controls

Include accessibility smoke assertions and console-error checks.

## Release checks

- clean install succeeds
- production build succeeds
- no accidental heavy or unused dependencies
- no official protected assets
- no hidden information leaks
- no forbidden entropy in authoritative game/AI code
- user-facing README
- architecture/testing docs
- `docs/DEPLOYMENT.md`
- `docs/RELEASE_CHECKLIST.md`
- known limitations
- static-hosting configuration appropriate to the repository

If a safe, already-authorized deployment target is present, deployment may be completed and verified. Otherwise do not request or expose credentials; leave exact deployment commands and configuration.

## Final commands

Run from the final committed repository:

```text
npm ci
npm run typecheck
npm run lint
npm run test
npm run build
npm run check
npm run simulate
npm run e2e
git diff --check
git status --short
```

If E2E requires a separate documented browser-install command, run it before `npm run e2e`.

Final stage commit:

```text
chore: harden browser V1 release candidate
```

The final working tree must be clean.

---

# Completion criteria

The goal is complete only when:

- Stages 12–17 each have a passing checkpoint and one commit
- one Human and three AI players can legally complete a game
- AI does not inspect hidden information
- save/load works
- complete UI works in a real browser
- simulation and E2E suites pass
- production build succeeds
- repository is deploy-ready
- working tree is clean

---

# Genuine blockers

Do not stop for ordinary implementation difficulty.

Stop only when:

- a frozen accepted contract is irreconcilably contradictory
- a destructive operation requires explicit user authorization
- an external credential is essential and cannot be safely obtained
- the environment lacks a required capability after reasonable documented alternatives are exhausted

When blocked:

1. preserve the latest clean stage commit
2. do not commit failing partial stage work
3. record the blocker in `docs/V1_COMPLETION_PROGRESS.md`
4. report the smallest exact decision needed

---

# Final report

Return:

1. stage-by-stage commit hashes and messages
2. architecture and files added
3. complete feature list
4. test/simulation/E2E/build totals
5. exact final command results
6. browser inspection results
7. security and hidden-information review
8. dependencies added and reasons
9. ADRs created
10. deployment readiness and exact boundary
11. known limitations
12. explicit confirmation that no V2 backend or multiplayer was added
13. final HEAD and clean-working-tree confirmation
