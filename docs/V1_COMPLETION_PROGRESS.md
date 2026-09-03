# V1 Completion Progress

## Baseline

- Branch: `feat/v1-completion-sprint-20260902`
- HEAD: `d650ecb991b066627177db17d313ad40ef410dcc`
- Accepted boundary: Tasks 00–11, 35 test files, 261 passing tests
- Baseline verification: `npm run check` passed on 2026-09-02 (typecheck, lint, 35 files / 261 tests, production build)

## Current stage

### Stage 12 — COMPLETE

Plan:

1. Compose the accepted focused executors behind one exhaustive authoritative engine boundary.
2. Add viewer-specific state, event, pending-decision, and legal-action projections without widening frozen Task 01 contracts.
3. Prove deterministic replay, validation precedence, exhaustive routing, and hidden-information redaction.
4. Document the application-facing engine and redaction boundary, run the full stage verification matrix, and commit the passing checkpoint.

Initial design decisions:

- Existing command executors remain the only rule-execution authorities; the unified router delegates by command discriminant.
- View contracts are new projection-only serializable types and never expose `GameState`.
- Legal actions reuse accepted validators/selectors and expose bounded capabilities rather than Cartesian command combinations.
- Sensitive event payloads are projected per viewer without changing `GameEvent`.

Files changed:

- `docs/V1_COMPLETION_PROGRESS.md`
- `docs/ARCHITECTURE.md`
- `docs/adr/ADR-0011-unified-engine-and-redacted-player-projections.md`
- `src/game/contracts/views.ts`
- `src/game/contracts/player-events.ts`
- `src/game/engine/game-engine.ts`
- `src/game/engine/game-engine.test.ts`
- `src/game/selectors/player-view.ts`
- `src/game/selectors/player-view.test.ts`
- `src/game/selectors/player-event-view.ts`
- `src/game/selectors/player-event-view.test.ts`

Verification results:

- Baseline `npm run check`: PASS — 35 test files, 261 tests, production build successful.
- Stage 12 `npm run typecheck`: PASS.
- Stage 12 `npm run lint`: PASS with zero warnings.
- Stage 12 `npm run test`: PASS — 38 test files, 271 tests.
- Stage 12 `npm run build`: PASS — 919 modules transformed; production bundle built.
- Stage 12 `npm run check`: PASS — typecheck, lint, 38 files / 271 tests, build.
- Stage 12 `git diff --check`: PASS (Git emitted only line-ending conversion notices).
- Diff review: frozen command/event/error/state contracts unchanged; no hidden-state access,
  duplicated execution rules, mutation, forbidden entropy, or UI/domain imports found.

Stage commits:

- Stage 12: `52b24ea66d368521a7393e12d3ed43cf7d774f86` — `feat: add unified game engine and redacted player views`
- Stage 13: `dbf4a1e4354be24363336e7a78c7a0b9e80572ae` — `feat: add deterministic core AI player`
- Stage 14: `5e53f708aca33733dec58a6f47725597c45ab986` — `feat: add trade AI and player personalities`
- Stage 15: `9306cd432e7fcde2eb1771689af0de3b7940d98b` — `feat: add local game gateway and browser persistence`
- Stage 16: `bc71f641e8e41dbdccc9fad995752f9589e86896` — `feat: add complete interactive game interface`
- Stage 17: this final stage commit — `chore: harden browser V1 release candidate`

Unresolved risks:

- Later full-game AI simulations may reveal legal dead ends that require fixes within accepted contracts.

Next stage:

- Stage 13 deterministic core AI implementation and verification.

### Stage 13 — COMPLETE

Plan:

1. Define the redacted-view-only asynchronous AI boundary, decision context, diagnostics, and
   deterministic stable tie-breaking.
2. Implement mandatory setup, turn, robber, development-card, maritime-trade, build, discard, and
   safe domestic-rejection decisions using authoritative legal projections.
3. Add explicit heuristic scoring for production, diversity/scarcity, income, build unlocks,
   expansion, ports, awards, threat, and projected score.
4. Add command/turn/game/no-progress/repeated-state safety guards and invariant-checked deterministic
   simulation support.
5. Prove focused decisions and at least 16 fixed all-AI smoke games, document the boundary, run the
   full stage verification matrix, and commit the passing checkpoint.

Design decisions:

- AI receives only `PlayerView`; command envelopes and authoritative execution remain outside the
  agent.
- Equivalent scores resolve by direct code-unit ordering; thinking consumes no authoritative RNG.
- Stage 13 rejects incoming domestic offers and does not initiate them; Stage 14 owns trade strategy.
- Simulation orchestration may hold `GameState` but exposes only each actor's view to the AI and
  asserts the full invariant stack after every accepted transition.

Files changed:

- `package.json`
- `docs/AI_DESIGN.md`
- `docs/AI_SIMULATION.md`
- `docs/ARCHITECTURE.md`
- `docs/adr/ADR-0012-redacted-deterministic-core-ai.md`
- `src/ai/ai-agent.ts`
- `src/ai/core-ai-agent.ts`
- `src/ai/core-ai-agent.test.ts`
- `src/ai/evaluation/core-evaluation.ts`
- `src/ai/simulation/core-ai-simulation.ts`
- `src/ai/simulation/core-ai-simulation.test.ts`
- `src/ai/simulation/core-ai-smoke-test-helper.ts`
- `src/ai/simulation/core-ai-smoke-1.test.ts`
- `src/ai/simulation/core-ai-smoke-2.test.ts`
- `src/ai/simulation/core-ai-smoke-3.test.ts`
- `src/ai/simulation/core-ai-smoke-4.test.ts`

Verification results:

- Stage 13 `npm run simulate:core -- 16`: PASS — 16/16 legal winners, 6,434 total
  commands, maximum 163 turns.
- Stage 13 `npm run typecheck`: PASS.
- Stage 13 `npm run lint`: PASS with zero warnings.
- Stage 13 `npm run test`: PASS — 44 test files, 282 tests, including 16 fixed all-seat AI games.
- Stage 13 `npm run build`: PASS — 919 modules transformed; production bundle built.
- Stage 13 `npm run check`: PASS — typecheck, lint, 44 files / 282 tests, build.
- Stage 13 `git diff --check`: PASS (Git emitted only line-ending conversion notices).
- Diff review: AI production code imports no `GameState`, hidden opponent collection, random module,
  clock/crypto entropy, UI framework, or state store; all commands route through `GameEngine`.

Dependencies:

- None added. The corpus runner uses Node 24's built-in TypeScript stripping.

Unresolved risks:

- Domestic negotiation intentionally remains a safe reject-only policy until Stage 14.
- Full invariant checks make the 16-game ordinary smoke corpus materially slower than unit tests,
  but the four fixed batches run in parallel and remain bounded.

Stage commit:

- `dbf4a1e4354be24363336e7a78c7a0b9e80572ae` — `feat: add deterministic core AI player`

Next stage:

- Stage 14 trade AI, personality profiles, mixed-profile simulations, and verification.

### Stage 14 — COMPLETE

Plan:

1. Add explicit Merchant, Builder, and Sentinel weight profiles on the accepted core agent boundary.
2. Implement visible-information-only marginal resource valuation, offer scoring, safe leader checks,
   deterministic accept/reject/counter decisions, and bounded initiation.
3. Enforce no repeated terms, no gifts/credit, at most two AI-initiated negotiations per turn, and
   the engine's one-counter depth.
4. Exercise AI-to-AI and AI-to-Human pending flows plus deterministic personality differences.
5. Run at least 24 mixed-profile fixed-seed games with invariant checks, document decisions, execute
   the full stage verification matrix, and commit the passing checkpoint.

Design decisions:

- Trade scoring uses only `PlayerView`, public board production, public score/award pressure, and the
  evaluating player's exact self hand.
- Deterministic trade IDs derive from turn, player, and bounded attempt counters supplied by
  orchestration context; no UUID, clock, or random source is used.
- Profiles adjust weights and thresholds on the same rule-obeying engine; they never change command
  legality or validation.

Files changed:

- `package.json`
- `docs/AI_SIMULATION.md`
- `docs/ARCHITECTURE.md`
- `docs/TRADE_AI.md`
- `docs/adr/ADR-0013-visible-information-trade-ai-personalities.md`
- `src/ai/ai-agent.ts`
- `src/ai/core-ai-agent.ts`
- `src/ai/personalities/ai-profiles.ts`
- `src/ai/personality-ai-agent.ts`
- `src/ai/personality-ai-agent.test.ts`
- `src/ai/trade/trade-evaluation.ts`
- `src/ai/trade/trade-evaluation.test.ts`
- `src/ai/simulation/core-ai-simulation.ts`
- `src/ai/simulation/mixed-profile-simulation.ts`
- `src/ai/simulation/run-mixed-simulations.ts`
- `src/ai/simulation/mixed-ai-smoke-test-helper.ts`
- `src/ai/simulation/mixed-ai-smoke-1.test.ts` through `mixed-ai-smoke-6.test.ts`

Verification results:

- Stage 14 `npm run simulate:mixed -- 24`: PASS — 24/24 legal winners, 15,753 total
  commands, maximum 164 turns, all three profiles covered.
- Stage 14 `npm run typecheck`: PASS.
- Stage 14 `npm run lint`: PASS with zero warnings.
- Stage 14 `npm run test`: PASS — 52 test files, 298 tests, including 24 fixed mixed-profile games.
- Stage 14 `npm run build`: PASS — 919 modules transformed; production bundle built.
- Stage 14 `npm run check`: PASS — typecheck, lint, 52 files / 298 tests, build.
- Stage 14 `git diff --check`: PASS (Git emitted only line-ending conversion notices).
- Diff review: production trade/personality modules receive only `PlayerView`; `GameState` appears
  only in test/simulation orchestration. No hidden collections, forbidden entropy, rule duplication,
  or UI/domain dependency was introduced.

Dependencies:

- None added.

Known limitations:

- Initiated V1 offers search bounded one-for-one terms; the counter path adds one minimal requested
  card rather than enumerating large bundles.
- Opponent benefit is deliberately estimated from public production, score, cards, networks, and
  awards rather than hidden hand composition.

Stage commit:

- `5e53f708aca33733dec58a6f47725597c45ab986` — `feat: add trade AI and player personalities`

Next stage:

- Stage 15 LocalGameGateway, deterministic AI orchestration, Zustand session/UI stores, and
  versioned browser persistence.

### Stage 15 — COMPLETE

Plan:

1. Define the application-facing `GameGateway` update/status contracts without exposing
   authoritative state.
2. Implement `LocalGameGateway` with stale-version enforcement, ordered redacted publications,
   deterministic command/trade counters, and bounded AI orchestration until a Human boundary.
3. Add versioned defensive save envelopes, repository abstraction, in-memory tests, browser
   localStorage implementation, autosave/manual load/delete, and deterministic resume metadata.
4. Add separate Zustand session and UI-interaction stores containing only redacted/session or
   transient presentation data.
5. Prove AI-to-Human pause/resume, non-current AI trade response, save equivalence/corruption
   recovery, subscriptions, and store authority boundaries; document and fully verify the stage.

Design decisions:

- Only `LocalGameGateway` and persistence repositories hold `GameState`; subscriber/store updates
  contain `PlayerView` and `PlayerEventView` only.
- Browser timestamps are injected persistence metadata and never enter deterministic engine state.
- AI command IDs and generated game IDs use injected/materialized counters and seed text, never UUID
  or hidden entropy.
- The gateway pauses whenever the required actor is Human, including non-current discard/trade
  response, and resumes orchestration after the Human's successful command.

Files changed:

- `vitest.config.ts`
- `docs/ARCHITECTURE.md`
- `docs/V1_COMPLETION_PROGRESS.md`
- `docs/adr/ADR-0014-local-gateway-orchestration-and-persistence.md`
- `src/application/gateways/game-gateway.ts`
- `src/application/gateways/local-game-gateway.ts`
- `src/application/gateways/local-game-gateway.test.ts`
- `src/application/stores/game-session-store.ts`
- `src/application/stores/ui-interaction-store.ts`
- `src/application/stores/stores.test.ts`
- `src/infrastructure/persistence/game-save-format.ts`
- `src/infrastructure/persistence/game-save-format.test.ts`
- `src/infrastructure/persistence/game-save-repository.ts`
- `src/infrastructure/persistence/game-save-repository.test.ts`

Verification results:

- Focused Stage 15 tests: PASS — 4 files, 14 tests.
- Stage 15 `npm run typecheck`: PASS.
- Stage 15 `npm run lint`: PASS with zero warnings.
- Stage 15 `npm run test`: PASS — 56 test files, 312 tests.
- Stage 15 `npm run build`: PASS — 919 modules transformed; production bundle built.
- Stage 15 `npm run check`: PASS — typecheck, lint, 56 files / 312 tests, build.
- Initial unbounded and four-worker full-suite attempts exposed CPU-contention timeouts in accepted
  simulation shards; every affected shard passed in isolation. Vitest is capped at two workers and
  the exact full commands pass without raising timeouts or reducing the 40-game corpus.
- Stage 15 `git diff --check`: PASS (Git emitted only line-ending conversion notices).
- Diff review: authoritative `GameState` is confined to the gateway/save boundary; stores and
  subscribers contain redacted contracts only. No forbidden entropy, domain-to-application import,
  backend, networking, or future multiplayer implementation was introduced.

Dependencies:

- None added. Zustand was already an accepted project dependency.

Tests added:

- Defensive JSON/schema/invariant save parsing and deterministic round-trip coverage.
- In-memory and localStorage repository contract coverage.
- Redacted gateway publication, stale rejection, autosave, load/delete/corruption recovery,
  AI-to-Human pause/resume, and non-current AI trade-response coverage.
- Separate session/UI store update, retention, reset, clamp, and authority-boundary coverage.

Known limitations:

- V1 stores one latest local game rather than a save catalogue.
- Browser localStorage necessarily contains the authoritative offline state; the application and UI
  receive only redacted projections.

Stage commit:

- `9306cd432e7fcde2eb1771689af0de3b7940d98b` — `feat: add local game gateway and browser persistence`

Next stage:

- Stage 16 complete interactive MUI and raw SVG browser interface.

### Stage 16 — COMPLETE

Plan:

1. Compose the browser application around one `LocalGameGateway`, a redacted session store, and a
   presentation-only interaction store.
2. Implement the Home/New Game and resumable-save workflows with a displayed materialized seed,
   Human name, original concise help, and recoverable feedback.
3. Render the accepted board topology as a responsive raw SVG with terrain, tokens, robber, ports,
   pieces, and keyboard-operable legal targets driven only by `PlayerView.legalActions`.
4. Add complete Human controls and dialogs for setup, turns, robber/discard, building, development
   cards, maritime/domestic trades, negotiation responses, victory, saving, and new games.
5. Add component/workflow/redaction/responsive tests, visually inspect desktop and 480px layouts,
   document the UI boundary, and run the complete Stage 16 verification matrix.

Design decisions:

- Screen state is local application presentation state; no router dependency is needed for two
  screens.
- UI command construction is centralized in a controller hook; components render accepted legal
  projections and never calculate legality or mutate game facts.
- SVG coordinates derive from the public board topology already present in `PlayerView`; clickable
  vertices/edges/tiles exist only when their IDs are present in the relevant legal-action list.
- Generated seeds are materialized at the browser application boundary and immediately displayed;
  tests inject deterministic factories.

Files changed:

- `vitest.config.ts`
- `docs/ARCHITECTURE.md`
- `docs/UI_DESIGN.md`
- `docs/V1_COMPLETION_PROGRESS.md`
- `docs/adr/ADR-0015-redacted-mui-svg-browser-interface.md`
- `src/app/app.tsx`
- `src/app/app.test.tsx`
- `src/app/browser-game.ts`
- `src/app/browser-runtime.ts`
- `src/theme/frontier-theme.ts`
- `src/ui/board/PlayableGameBoard.tsx`
- `src/ui/board/PlayableGameBoard.test.tsx`
- `src/ui/controllers/game-command-controller.ts`
- `src/ui/controllers/game-command-controller.test.ts`
- `src/ui/dialogs/GameDialogs.tsx`
- `src/ui/dialogs/GameDialogs.test.tsx`
- `src/ui/game/ui-format.ts`
- `src/ui/pages/HomePage.tsx`
- `src/ui/pages/GamePage.tsx`
- `src/ui/panels/ActionPanel.tsx`
- `src/ui/panels/PlayerPanels.tsx`
- `src/ui/panels/ResourceHand.tsx`

Behaviour implemented:

- Complete Home/New Game, materialized seed, continue/delete save, and original quick-rules screen.
- Gateway/Zustand-driven game screen with responsive public SVG board, terrain/tokens/robber/ports,
  public pieces, players, private Human hand, scores/awards, roll, action panel, redacted log, status,
  save/restart/new-game, and victory UI.
- Human setup, roll/end, discard, robber/target, paid and free building, development purchase/play,
  Invention, Monopoly, Road Building finish, maritime trade, domestic propose/respond/counter, and
  victory workflows, all using projected legal actions and the shared command gateway.
- Keyboard-operable named SVG targets, visible focus, dialog focus management, reduced-motion rule,
  wrapped controls, and a no-horizontal-overflow mobile layout.

Verification results:

- Focused Stage 16 UI tests: PASS — 5 files, 10 tests.
- Stage 16 `npm run typecheck`: PASS.
- Stage 16 `npm run lint`: PASS with zero warnings.
- Stage 16 `npm run test`: PASS — 59 test files, 318 tests.
- Stage 16 `npm run build`: PASS — 990 modules transformed; production bundle built. Vite emitted a
  non-failing 623.67 kB main-chunk advisory for the combined MUI/local-engine application.
- Stage 16 `npm run check`: PASS — typecheck, lint, 59 files / 318 tests, build.
- Stage 16 browser verification: PASS — real `LocalGameGateway` start, AI setup advance,
  Human settlement/road submissions, save, and next Human boundary; no console warnings/errors.
- Responsive browser measurements: PASS at 1440×900, 1024×768, and 480×800; scroll width equalled
  client width at every size, SVG and header controls stayed in bounds, and the temporary viewport
  override was reset.
- Stage 16 `git diff --check`: PASS (Git emitted only line-ending conversion notices).
- Diff/privacy review: production `src/app` and `src/ui` contain no `GameState`, authoritative deck,
  RNG state, console logging, `Math.random`, or random UUID access. The only entropy is the explicit
  materialized browser seed factory outside domain/AI code. No router, backend, network, official
  artwork, or future multiplayer feature was added.

Dependencies:

- None added. The implementation uses the accepted React, MUI, Zustand, and Roboto dependencies.

Tests added or updated:

- App start/continue/delete and real-engine SVG command submission.
- Public playable board layers and Enter-key target activation.
- UI controller refusal of non-projected board targets.
- Exact discard selection and redacted domestic-trade response actions.

Known limitations:

- The tablet/mobile layout is intentionally vertically stacked rather than offering board pan/zoom.
- The complete local engine plus MUI ships in one 623.67 kB minified entry chunk before Stage 17
  bundle hardening review.

Stage commit:

- `bc71f641e8e41dbdccc9fad995752f9589e86896` — `feat: add complete interactive game interface`

Next stage:

- Stage 17 release hardening, 100-seed simulation, E2E, documentation, and static deployment setup.

### Stage 17 — COMPLETE

Plan:

1. Add a deterministic `npm run simulate` release corpus of at least 100 fixed mixed-profile seeds,
   preserving per-command invariant checks, bounded progress, stable summaries, and complete traces.
2. Add Playwright E2E with schema-valid saves derived from accepted engine helpers and cover new
   game/setup, normal turns/building, seven, maritime/domestic trade, save/reload, victory, and
   starting again without production backdoors.
3. Perform release security, hidden-information, entropy, asset, dependency, and bundle audits;
   improve only concrete release issues.
4. Update the README and architecture/testing docs; add deployment, release checklist, known
   limitations, static-host configuration, and a final ADR.
5. Run the complete Stage 17 and final clean-install command matrices from the committed release
   candidate, create the final stage commit, and leave a clean tree.

Initial design decisions:

- The 100-seed corpus is separate from ordinary Vitest and uses the accepted mixed-profile
  simulation engine, which already checks the full invariant chain after every command.
- E2E fixtures live under `tests/e2e`, are serialized through the production save format, and enter
  only through browser localStorage; production code exposes no fixture or debug API.
- Static deployment configuration will describe a build output only. No deployment is authorized or
  attempted without an existing configured target and credentials.

Files changed:

- Release scripts/config: `package.json`, `package-lock.json`, `playwright.config.ts`,
  `tsconfig.e2e.json`, `vitest.config.ts`, `.gitignore`, `netlify.toml`, and `MANIFEST.json`.
- Simulation: `src/ai/simulation/core-ai-simulation.ts`, `release-simulation-report.ts`, its tests,
  and `run-release-simulations.ts`.
- Browser E2E: `tests/e2e/save-fixtures.ts` and `tests/e2e/v1-release.spec.ts`.
- Release fixes: `src/ui/controllers/game-command-controller.ts` and its regression test, plus
  Latin-only Roboto entry imports in `src/main.tsx`.
- User/release docs: `README.md`, `START_HERE.md`, `docs/AI_SIMULATION.md`,
  `docs/ARCHITECTURE.md`, `docs/TESTING.md`, `docs/DEPLOYMENT.md`,
  `docs/RELEASE_CHECKLIST.md`, `docs/KNOWN_LIMITATIONS.md`, this progress file, and ADR-0016.

Behaviour implemented:

- Fixed 100-seed mixed-profile release corpus with invariant checks after every command, ordered
  deterministic summary hashing, bounded progress, and complete invariant-failure traces.
- Five real Chromium workflows covering all ten required paths, accessible roles/names, mobile
  overflow, redacted DOM text, save persistence, and console/page-error capture.
- Correct paid-build board targeting when normal-phase setup projections are present as empty arrays.
- Reproducible static release configuration, security/cache headers, release metadata, clean
  Vitest/Playwright suite separation, and an optimized eight-file Latin font payload.

Verification results:

- `npx playwright install chromium`: PASS — pinned Chromium, headless shell, FFmpeg, and Windows
  dependency helper installed.
- Stage 17 `npm run typecheck`: PASS — application and strict E2E TypeScript projects.
- Stage 17 `npm run lint`: PASS with zero warnings.
- Stage 17 `npm run test`: PASS — 60 test files, 321 tests.
- Stage 17 `npm run build`: PASS — 990 modules transformed; 0.87 kB CSS, eight local Latin font
  assets, and 623.69 kB / 185.22 kB gzip entry JavaScript. The size advisory is documented.
- Stage 17 `npm run check`: PASS — typecheck, lint, 60 files / 321 tests, and production build.
- Stage 17 `npm run simulate`: PASS — 100/100 legal winners, 65,341 commands, maximum 996 commands,
  170 turns, and 467 RNG draws; East 33, West 21, South 28, North 18; hash `1adc49e8`.
- Stage 17 `npm run e2e`: PASS — 5/5 Chromium tests in 18.0 seconds with no captured browser errors.
- `npm audit --omit=dev`: PASS — zero production vulnerabilities.
- Dependency/asset/privacy audit: PASS — every runtime package is used or a required MUI peer;
  Playwright is dev-only; no protected media, network/service code, production test backdoor,
  hidden-state UI/store import, or forbidden game/AI entropy was found.
- Stage 17 `git diff --check`: PASS (Git emitted only line-ending conversion notices).

Dependencies:

- Added `@playwright/test` as a development dependency for repeatable Chromium E2E. No runtime
  dependency or hosting SDK was added.

Tests added or updated:

- Stable-hash and empty-corpus release-report coverage.
- Paid-build UI-controller regression coverage for empty normal-phase setup arrays.
- Five browser E2E workflows built from accepted-engine, production-serialized saves.

Known limitations:

- The combined offline engine/MUI entry chunk retains Vite's non-failing size advisory.
- E2E is Chromium-only and needs a one-time browser install.
- The 100-game corpus is CPU-intensive and remains separate from ordinary `npm run check`.
- Deployment is configured and documented but was not performed because no authorized target was
  present.

Stage commit:

- This commit — `chore: harden browser V1 release candidate`

Next step:

- Repeat the mandated final clean-install and verification matrix from the committed release
  candidate, then confirm the tree is clean.
