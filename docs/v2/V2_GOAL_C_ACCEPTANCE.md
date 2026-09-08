# Frontier Isles V2 Goal C Acceptance

Automated acceptance: PASS. Human deployment UAT: PENDING.

Branch: `feat/v2-online-multiplayer`; required baseline:
`302a951dad3828467c743a20d454198627d9cb8e`.

## Commits and implemented boundaries

| Task | Commit | Result |
| --- | --- | --- |
| V2-09 | `37362a6517ccf359b207eda55f4114f0f356fa2f` | Ordered browser delivery; exact replay, conflict rejection, per-game Human/AI FIFO and fresh resync |
| V2-10 | `9342a067aa009f5914a20613c3b2e45621e251f5` | Pause/grace/recovery, deterministic Host transfer, explicit permanent AI takeover and cleanup |
| V2-11 | `d79aaa2286dc76bc13193adda732a5be806ad8e2` | Atomic private SQLite aggregates, exact restart recovery, digest-only credentials and fail-closed corruption isolation |
| V2-12 | This V2-12 commit | Security, browser/load/artifact qualification and local production deployment reference |

The V2-12 commit subject is `chore: harden and prepare online multiplayer alpha`. The consolidated
delivery report records its full SHA and post-commit clean-tree/four-commit verification; a commit
cannot embed its own SHA. No additional Goal C commit, history rewrite, push, merge, Git tag,
image/package publication or external deployment is authorized or performed.

## Delivery and concurrent execution

One ordered browser queue (default eight entries) submits a stable immutable command ID/payload.
Default acknowledgement timeout is eight seconds with two bounded retries and 250/500 ms delay;
reattachment has a bounded wait and session/game closure cancels pending work. Validated views
are monotonic and identity scoped. Stale, uncertain, missing/invalid or discontinuous updates cause
fresh authoritative resynchronization. Browsers never execute authoritative online mutations.

Each GameSession has its own FIFO queue (default 64, maximum 256). Human and AI work shares that
boundary; transport authority is checked again on dequeue. Coalesced AI work rechecks presence
after awaiting a choice. Per-Human FIFO command results (default 128, maximum 1024) bind the full
canonical request fingerprint, game/session/command identity, result and version. Exact replay
returns the original acknowledgement with no state/RNG/AI/publication effect. Conflicting reuse
is rejected; eviction is deterministic and does not confer stale-command authority.

The delivery suites drop acknowledgements, retry after reconnect/AI advancement, inject stale
versions and old transports, exercise every command family, run same/different-Human competitors
and hold one Room while another progresses. The accepted command-family matrix remains in
[Goal B acceptance](V2_GOAL_B_ACCEPTANCE.md).

## Presence and restart policy

Any active Human disconnect pauses Human and AI mutations immediately, preserving exact core
state/RNG and pending decisions. Grace is 30 seconds. Valid resume retains session/seat/PlayerId;
the newest valid socket replaces the old one. Expiry invalidates that Human's authority and leaves
a replacement decision. An expired Host transfers to the first connected Human in canonical seat
order. Only the connected Host selects an AI profile or closes the paused game. AI takeover is
irreversible for the same PlayerId/board position, uses a controller overlay, and receives only that
player's view. Unresolved/finished retention defaults to 30 minutes; no eligible Human means closure.

One Node 24 process owns one SQLite file with WAL, FULL synchronous commits and exclusive locking.
Version-1 strict canonical aggregates have SHA256 checksums and a 2 MiB per-Room limit. Game state,
RNG, private hands/deck/decisions, mappings, overlays, metadata/deadlines and bounded results commit
atomically before success acknowledgement or publication. Raw ResumeTokens, socket IDs, timers,
callbacks and IP addresses never persist. The existing Zod version was declared directly for server
validation; built-in SQLite introduces no external database/native npm package.

Recovery restores exact authority and pauses for Humans. Previously connected seats receive a
120-second restart window; disconnected/expired deadlines are never renewed. Corrupt/future/
oversized/colliding records are isolated, unrelated valid Rooms load, and invalid database layout/
version or over-capacity storage fails without reset. Interrupted transactions preserve the last
good commit; a failed COMMIT produces neither success nor a new publication. Shutdown stops
admission, cancels awaited AI, drains queues, flushes and closes transports/storage.

## V2-12 security, deployment and repairs

Production uses an explicit exact Origin allowlist on HTTP and Engine.IO polling/upgrades/direct
WebSockets, strict environment/private/public path validation, payload/depth/node/prototype guards,
bounded global/transport/session rates, 64-Room/320-transport ceilings, safe acknowledgements and
whitelisted logs. HTTP serves only confined built assets with CSP/headers and body/size/time bounds.
Liveness/readiness are separate; recovery/write/shutdown state governs readiness. No debug, fixture,
cache, state, source-map or storage endpoint exists. Private-path aliases are checked by realpath.

V2-12 repairs prior asynchronous lobby attachment races by establishing ownership before awaiting
channel membership and rechecking newest authority on completion. It bounds recovery allocations
and slow private-view receipt backlogs, prevents timer overflow, and closes storage after checkpoint
failure. The four-Human setup helper accepts its legal sixteenth action. Native tab duplication and
trace redaction preserve credentials without weakening any gameplay assertion or failure outcome.

The multi-stage image serves frontend and Socket.IO from one origin, uses non-root UID 1000,
read-only root, private persistent volume, healthcheck, graceful stop, dropped privileges, bounded
CPU/memory/PIDs and rotated logs. Local smoke uses a unique loopback-only container built by image
ID, proves SIGKILL/restart/resume/exact replay/graceful flush and removes its own container/temp data.
Operator commands, TLS/WebSocket proxy requirements, private backup/restore and upgrade/rollback
are in [V2 Deployment](V2_DEPLOYMENT.md). Multiple replicas/network filesystems are unsupported.

## Final command results

The final clean-install `check:all` passes all 104 test files / 669 tests, with no skipped tests.
These are unique tests; repeated command invocations and the subsets below are not additional tests.

| Package | Files | Passing tests |
| --- | ---: | ---: |
| Frontend | 23 | 102 |
| game-core | 35 | 261 |
| game-ai | 15 | 36 |
| realtime-contracts | 7 | 66 |
| Server | 24 | 204 |
| Total | 104 | 669 |

The server total includes six explicitly named `*.integration.test.ts` files / 29 tests.
Overlapping focused subsets are delivery 13, presence/replacement 20, recovery 26, security 52
and load one. Other real-socket workflow/privacy/full-game tests also remain in the server total.
Vitest's collected test inventory confirms these counts. Goal C adds 140 tests over the accepted
529-test Goal B baseline; neither pure game package changes.

V1 simulation passes 100/100 legal winners, 65,341 commands, maxima of 996 commands / 170 turns /
467 RNG draws, and the required hash `1adc49e8`. Online simulation passes six legal winners:
two repeated runs each of 2H+2AI, 3H+1AI and 4H. Each ends at version 749, turn 134 and RNG draw
383, with public SHA256 `ead66aa5cb05a2b907c1ea9f7e40078389d9cf34c32e1bf132e40b03123652a3`.
Human/AI command counts are respectively 389/360, 562/187 and 749/0. Both complete JSON reports
compare exactly equal to the saved accepted baseline; comparison exits 0.

The explicit recovery and security reruns pass 26/26 and 52/52 tests. The one bounded load smoke
passes two allocation/cleanup cycles: 16 total Rooms, peak eight concurrent Rooms (four waiting,
four active), eight total active games, 24 peak sockets, 56 connections, eight reconnects,
1,168 commands, 64 snapshot requests and 600 private publications. Runtime is 20,275 ms.
RSS starts at 91,246,592 bytes with sampled maximum 369,528,832; heap starts at 31,069,664
with sampled maximum 154,576,768. Memory is sampled before and after each cycle, not continuously.
All owned queues/caches/views/listeners/timers/AI work/receipts/socket and limiter entries return
to zero; sampled memory alone is not a leak proof or a production capacity claim.

Browser qualification passes `e2e:lobby` 6/6, `e2e:online` 24/24 and the full `e2e` 38/38, with
zero retries/skips. The full run includes all eight dedicated V1 journeys, all six accepted Lobby
journeys and all thirteen accepted Goal B online journeys. Goal C adds two delivery, four presence,
two three/four-Human seating and three production pending-decision restart journeys: eleven added
browser tests. Separate Human contexts exercise 1440x900, 1024x768 and 480x800 viewports.

The forced-trace run passes all 30 Lobby/online journeys and retains 30 traces. Automatic redaction
removes 134 distinct token/session values; the independent audit reports zero remaining tokens,
session identities, digests, command fingerprints or authoritative RNG payloads. No final failure
reports were produced. Original test steps, screenshots and pass/fail outcomes remain intact.

The local production-container smoke passes in 134.9 seconds using image
`sha256:894729ad8099978d0327f8eb01fd107a2a00cabba2f62f5fd6edc842655039a5`.
Runtime: Node v24.19.0, SQLite 3.53.3, UID 1000 and read-only root; repository test fixtures and
server/shared-package source maps are excluded from the runtime.
Four Humans create/Ready/Start, execute one legal command, survive SIGKILL and resume on a second
process start, then replay that exact command without a second mutation. Exact state/RNG and
graceful flush pass; all five tested private URLs return 404. The smoke removes its own container
and private temporary data. No image tag, publication or external deployment is performed.
`npm audit` exits 0 with zero vulnerabilities.

All 21 commands in the final clean-install qualification sequence exit 0. Exact command durations
include prerequisite builds and are recorded below. Logs are `logs/goal-c-12-final-1-*.log`.

| Command | Exit | Seconds |
| --- | ---: | ---: |
| `npm ci` | 0 | 14.9 |
| `npm run typecheck` | 0 | 21.2 |
| `npm run lint` | 0 | 12.2 |
| `npm run test` | 0 | 215.1 |
| `npm run build` | 0 | 22.3 |
| `npm run check:server` | 0 | 393.2 |
| `npm run check:all` | 0 | 659.1 |
| `npm run check:game` | 0 | 210.5 |
| `npm run simulate` | 0 | 467.4 |
| `npm run simulate:online` | 0 | 380.8 |
| `npm run test:recovery` | 0 | 27.5 |
| `npm run test:security` | 0 | 29.1 |
| `npm run test:load` | 0 | 37.2 |
| `npm run e2e:lobby` | 0 | 59.2 |
| `npm run e2e:online` | 0 | 398.3 |
| `npm run e2e` | 0 | 466.4 |
| `npm run e2e:audit` | 0 | 510.6 |
| `npm run audit:artifacts` | 0 | 2.1 |
| `npm run smoke:container` | 0 | 134.9 |
| `npm audit` | 0 | 9.3 |
| `npm run check` | 0 | 217.0 |

After reviewing the pinned esbuild installer policy, an additional `npm ci` exits 0 in 17.5 seconds:
328 packages installed, 333 audited, zero vulnerabilities, no npm warning or unreviewed-script
notice. Its subsequent `npm run check` exits 0 in 270.3 seconds, repeating frontend/core/AI
typechecks, zero-warning lint, all 399 tests and the production build from that clean install.
Logs are `logs/goal-c-12-final-install-policy-*.log`.

Both complete simulation report comparisons, production Compose configuration validation,
`git diff --check`, documentation links and exact 110-file manifest comparison exit 0. The
smoke-container inventory is empty. Intermediate failures and fixes are retained in
[progress](V2_GOAL_C_PROGRESS.md) and ignored verification logs; no failed or skipped check
counts as acceptance. The existing Vite entry-chunk advisory (822.09 kB, 241.38 kB gzip) and Node
color-environment notice are documented; there are no lint warnings or unresolved required checks.

## Privacy evidence and limitations

Runtime schemas, gateway tests and real sockets inspect RoomSnapshot, PlayerView, projected events,
acknowledgements, retry/cache behavior, ownership and redaction. Browser checks cover application
views, DOM/attributes, accessibility, console, private choices, all three viewport sizes and separate
Human contexts. Production logs expose fixed codes/counts only; private persistence never enters
the public root or client contracts. AI and core remain pure within their accepted package boundaries.

Actual forced Playwright traces revealed tool-retained authentication frames. The new reporter
redacts token/session values from ZIP text/network resources while preserving failure evidence,
screenshots and steps. An independent bounded scanner checks remaining identities/digests/cache
fingerprints/RNG. Fifteen initial traces and three failure reports were preserved after redacting
74 distinct identities, with a clean independent scan. Test screenshots can show their own synthetic
player's hand; all evidence remains private ignored development data, never a served/public artifact.

This anonymous alpha has no account recovery, Human substitution, invitation system, moderation,
chat, spectators, matchmaking, rankings, payments, expansions, remote backup automation or
distributed scaling. Loss of tab credentials or permanent loss of the host/private volume can lose
a seat or availability. Local measured load is not a production capacity or DoS-resistance claim.
TLS/DNS/firewall/network/device and operator backup/restore checks remain separate Human UAT.
Automated browser tests use pinned Chromium; other engines and physical devices remain Human UAT.

## Dependencies, documentation and scope

No new external runtime version or native SQLite package was added. V2-11 declared existing Zod
4.5.4 directly in the server; Node is constrained to the tested 24.19+ Node-24 line. V2-12 changes
only the root prerelease to `2.0.0-alpha.1`; private packages stay `0.1.0`. Trace ZIP handling uses
built-in Node compression/CRC and adds no dependency. Lockfile audit results are recorded above.

The existing esbuild install script was reviewed and approved only at locked version `0.28.2` in
project metadata, resolving npm's unreviewed-script notice without a blanket approval or version change.

ADRs 0010–0013 document delivery, presence, persistence and security/deployment. README, architecture,
testing, limitations, recovery and release documents are updated; new protocol/security/deployment/
alpha-testing/Human-UAT references explain operation and boundaries. The [changed file manifest](V2_GOAL_C_FILES.md)
lists all 110 Goal C files: 59 created and 51 changed. No unrelated future feature was implemented.
The final delivery report supplies the post-commit clean-tree and exact four-commit verification.
