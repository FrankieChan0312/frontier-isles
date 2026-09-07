# Goal B Automated Coverage

Task gates and resolved findings are recorded in [Goal B progress](V2_GOAL_B_PROGRESS.md).
Design decisions: [shared packages](ADR-V2-0006-shared-game-package-extraction.md),
[server authority](ADR-V2-0007-server-authoritative-game-sessions.md),
[browser gateway](ADR-V2-0008-online-game-gateway-and-browser-views.md), and
[online qualification](ADR-V2-0009-online-workflow-qualification.md).

## Reproduction

```sh
npm ci
npm run check:all
npm run simulate
npm run simulate:online
npm run e2e:lobby
npm run e2e:online
npm run e2e
```

Use Node 24 and the pinned Playwright Chromium installation. Tests start their own loopback
services; do not run a competing service on ports 3001 or 4173. `simulate:online` executes six
complete real Socket.IO games, with two identical runs for each supported seating mode. It emits
public summaries only. Normal tests also repeat all three modes with per-command invariants.

## Complete-game results

Seed: `GOAL-B-ONLINE-001`. Each mode runs twice and requires an identical complete summary.

| Seating | Legal winners | Commands / final version | Human / server AI commands | Turns | RNG draws | Winner |
| --- | --- | --- | --- | --- | --- | --- |
| 2 Humans + 2 AI | 2/2 | 749 | 389 / 360 | 134 | 383 | EAST, 10 points |
| 3 Humans + 1 AI | 2/2 | 749 | 562 / 187 | 134 | 383 | EAST, 10 points |
| 4 Humans | 2/2 | 749 | 749 / 0 | 134 | 383 | EAST, 10 points |

All three modes end with canonical NORTH/EAST/SOUTH/WEST public scores `5 / 10 / 4 / 2`.
Using equivalent deterministic profiles for Human test drivers and server AI also preserves
the public sequence across controller partitions. The SHA-256 public trace hash is
`ead66aa5cb05a2b907c1ea9f7e40078389d9cf34c32e1bf132e40b03123652a3` in every run.
These are real initialized games, with no scenario fixture used for full-game completion.
The complete-game corpus naturally exercises 19 command types; the controlled free-road
dead-end case supplies `FINISH_FREE_ROAD_PLACEMENT` for the full 20-command workflow inventory.

## Final verification totals

All required typecheck, zero-warning lint, test, build and aggregate commands exit 0.

| Suite | Files | Passing tests |
| --- | --- | --- |
| Frontend/application | 22 | 85 |
| game-core | 35 | 261 |
| game-ai | 15 | 36 |
| Realtime contracts | 6 | 62 |
| Server/integration | 11 | 85 |
| Total | 89 | 529 |

The V1 corpus remains 100/100 legal winners, 65,341 commands and hash `1adc49e8`.
Online E2E passes 13/13, Lobby E2E passes 6/6, and full E2E passes 27/27, including all eight
accepted V1 journeys. All three target viewports pass overflow checks; private-view, console,
accessibility, refresh and duplicate-tab assertions pass. No accepted test was weakened or skipped.
Earlier diagnostic failures and their resolutions are recorded in the progress report.

## Workflow evidence

| Command or behavior | Server/network coverage | Real online browser path |
| --- | --- | --- |
| `PLACE_INITIAL_SETTLEMENT`, `PLACE_INITIAL_ROAD` | Exact 4H setup snake; full mixed games | Shared 2H+2AI initial setup |
| `ROLL_DICE`, `END_TURN` | Normal authority, full games, controlled production | Both Human turns cross browsers |
| Resource production and bank shortage | Roll eight: full production, multi-player refusal, single-player partial allocation | Normal roll and visible bank/supply |
| `DISCARD_RESOURCES` | Private Human decisions pause AI; AI completes its own discard | Both Human discard dialogs after a real seven |
| `MOVE_ROBBER`, `STEAL_FROM_PLAYER` | Target authority, random transition, redacted theft | Acting-player tile and target controls |
| `BUILD_ROAD`, `BUILD_SETTLEMENT`, `UPGRADE_CITY` | Paid cost, ownership, piece and score invariants | Two roads, settlement and city on both boards |
| Longest Road | Fifth connected road changes award/score | Award and public score synchronize |
| Largest Army | Third real Knight play changes holder | Both browser views see the award |
| `BUY_DEVELOPMENT_CARD` | Owner-only hidden Victory Point, unchanged public score | Private card article; other Human sees only public count/event |
| `PLAY_DEVELOPMENT_CARD`: Knight | Ownership/card limit and full robber effect | Play, move, choose target |
| `PLAY_DEVELOPMENT_CARD`: Road Building | Two free roads without resource payment | Two highlighted free-road placements |
| `FINISH_FREE_ROAD_PLACEMENT` | Reject while a route remains; allow actual dead end | Play card, place road, finish remaining placement |
| `PLAY_DEVELOPMENT_CARD`, `CHOOSE_INVENTION_RESOURCES` | Actor-only selection, bank transfer | Choose a legal two-card pair |
| `PLAY_DEVELOPMENT_CARD`, `CHOOSE_MONOPOLY_RESOURCE` | Actor choice and complete resource transfer | Choose resource; other Human hand updates |
| Hidden Victory Point cards and victory | Four-Human shared final lifecycle, revealed winning points, post-game rejection | Winning city, both dialogs, finished refresh and return Home |
| `MARITIME_TRADE` | Projected ratio, bank deltas | Choose one projected exchange |
| `PROPOSE_TRADE`, `ACCEPT_TRADE`, `REJECT_TRADE` | Human/Human, Human/AI and AI/Human authority | All negotiation directions through actual dialogs |
| `COUNTER_TRADE` | Stable parties, atomic exchange, wrong responder and second counter rejection | Human counter accepted; AI accepts favorable and rejects unfavorable counter |

The network suite checks that all 20 command types were accepted over the wire. The workflow
browser suite checks its command inventory; the separate natural-game journeys cover initial
setup and normal turn commands. Full-game completion remains in Node integration to avoid long
browser automation. Every Human test driver reads only its own network projection.

## Hidden-information evidence

| Surface | Evidence |
| --- | --- |
| Socket.IO snapshots/updates | Recursive strict runtime schemas, exact viewer identity, per-Human socket publication |
| Commands/acknowledgements | Actor omitted; server derives session actor before cache; code-only rejection and compact outcome |
| PlayerView and events | Opponents have public counts/scores only; private discard/card/theft fields checked per viewer |
| Room snapshots | Public seat state without GameState, credential, token digest or command cache |
| Application state | Separate projection stores; identity change clears event history; no online save adapter |
| React props | GamePage/controls accept PlayerView; public cards receive explicit public fields; no GameState imports |
| DOM/accessibility | Own hand/card controls only; observer cannot see another player's private pending controls |
| Browser console | Every multi-browser journey requires no console or React errors |
| Server logs | Poisoned client input and secret AI exceptions produce no raw logging or diagnostic publication |
| Test traces | Full-game failures report public command type, seat/turn, phase and version; no private command payloads |

Refresh and duplicate-tab tests retain the accepted sessionStorage credential mechanism and
prove that the original tab loses command authority. Normal online games never write localStorage
authoritative saves. Single Player retains its accepted local save, which remains inspectable by
the owner of that offline device.

## Intentionally deferred

Goal C owns automatic retries/delivery/concurrency hardening, extended disconnect pause or AI
replacement, durable repositories, restart recovery and production deployment/hardening. Rooms
and games remain process-local; active resume is limited to existing grace. Started seats stay
fixed, and finished-game Home navigation does not reset or recycle the server Room.

Human multiplayer UAT remains pending after automated acceptance.
