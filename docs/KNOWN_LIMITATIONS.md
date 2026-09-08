# Known Limitations

- V2 `2.0.0-alpha.1` is prepared for separate Human deployment UAT. Local automated container
  qualification does not validate public TLS/DNS/firewalls, remote browser networks or production
  capacity. The supported reference is one Node process and one private local SQLite volume.
- Room/transport safety caps are 64/320. Global and per-session/transport rate limits can reject
  bursts with safe `RATE_LIMITED`/`SERVER_BUSY` messages. The measured local load is deliberately
  smaller; it is not an internet capacity or denial-of-service protection claim.
- Resume credentials are anonymous tab-scoped bearer secrets, not accounts or transferable seats.
  SQLite/backup access exposes private game data and requires operator protection; there is no
  encryption-at-rest service or automatic remote backup. Production debug logging is prohibited.

- Single Player remains a single-device, four-player game with exactly one Human and three local AI
  players. Online Multiplayer uses the server's four-seat game with at least two Humans and
  explicitly assigned AI seats. There is no login, cloud save, spectator mode, or cross-device credential sync.
- Online authority runs in one Node process, with recoverable SQLite records on local persistent
  disk. Multiple processes/replicas and network filesystems are unsupported. The Node SQLite API
  is a release candidate and requires the tested Node 24.19+ runtime family. Permanent loss of
  the machine or volume can lose availability; keep private backups. Resume credentials are
  tab-scoped sessionStorage data. Disconnect grace is 30 seconds; restart grants 120 seconds to
  previously connected Humans. Previously disconnected or expired credentials gain no extension.
  Waiting-Room idle expiry remains 30 minutes.
- Started game PlayerIds and board positions remain fixed. Any active Human disconnect pauses
  Human commands and AI. Within grace the same Human can resume; after expiry only the connected
  Host can permanently replace that Human with a selected AI profile, or close the game. The
  expired credential cannot reclaim the seat. There is no Human substitution or undo of replacement.
  Restart restores the original controller overlay and does not undo replacement.
- One latest Single Player save is stored in localStorage for the current browser origin. It is not encrypted or
  tamper-proof and disappears if the user clears site data.
- The browser save contains authoritative offline state by necessity. Hidden data is excluded from
  `PlayerView`, events, Zustand stores, React props, and rendered UI, but a device owner can inspect
  their own localStorage with developer tools.
- Online browsers store only their current PlayerView/event projection in memory and a Room
  resume credential in sessionStorage. They never write an authoritative online save. Interrupted
  commands use a bounded ordered retry queue and authoritative snapshot resync. The queue is
  memory-only and does not survive a reload. Exact-result replay retains the latest 128 results
  per Human session by insertion order; evicted successful requests are rejected as stale.
  Recent results and fingerprints are persisted atomically with game state, so retained retries
  remain safe after a server restart. Older evicted results are not a permanent command ledger.
  Exhausted retries report an uncertain outcome, even when a newer view has arrived.
- Finishing a game allows each browser to return Home by detaching its own credential. Finished
  games and games awaiting replacement expire after `GAME_ABANDONED_TTL_MS` (30 minutes by
  default), unaffected by snapshot polling. No eligible Human sessions closes a game immediately.
  Room reuse is not supported.
- AI is deterministic, heuristic, and bounded. It does not learn, search exhaustively, or claim
  optimal play; one-for-one offers and one minimal counter keep domestic negotiation finite.
- The mobile/tablet board fits its full topology and stacks controls vertically; V1 has no board
  pan/zoom gesture.
- The optimized entry chunk is approximately 822 kB before transport compression because the full
  offline engine, MUI application, realtime validators, and Socket.IO client load together. Vite
  reports this as an advisory, not a failure.
- Release E2E targets the pinned Playwright Chromium build with separate Human contexts and
  desktop/tablet/mobile viewports. Other browser engines and physical devices remain Human UAT.
- The 100-game invariant corpus is deliberately separate from ordinary tests and can take several
  minutes on a CPU-constrained machine.
- Complete online-game tests use bounded Node Human drivers over real Socket.IO, with representative
  browser paths for every command family. Goal C adds delivery, presence, restart and three/four-Human
  browser journeys. Independent real-device/browser and external deployment Human UAT remains pending.
- Static deployment configuration is present, but no live site was published during Stage 17.
