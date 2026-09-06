# Known Limitations

- Single Player remains a single-device, four-player game with exactly one Human and three local AI
  players. Online Multiplayer uses the server's four-seat game with at least two Humans and
  explicitly assigned AI seats. There is no login, cloud save, spectator mode, or cross-device credential sync.
- Online Rooms and sessions are process-local: a server restart loses them. Resume credentials are
  tab-scoped sessionStorage data, reconnect grace defaults to 30 seconds, waiting-Room idle expiry
  defaults to 30 minutes, and only one long-running server process is supported.
- Started game seats remain fixed. Active-game resume is supported within the reconnect grace;
  expiration invalidates the credential without removing the player or substituting AI. Extended
  pause/replacement, game persistence and server restart recovery remain later V2 work.
- One latest Single Player save is stored in localStorage for the current browser origin. It is not encrypted or
  tamper-proof and disappears if the user clears site data.
- The browser save contains authoritative offline state by necessity. Hidden data is excluded from
  `PlayerView`, events, Zustand stores, React props, and rendered UI, but a device owner can inspect
  their own localStorage with developer tools.
- Online browsers store only their current PlayerView/event projection in memory and a Room
  resume credential in sessionStorage. They never write an authoritative online save. Interrupted
  commands trigger snapshot resync; automatic retry and full delivery guarantees remain V2-09.
- Finishing a game allows each browser to return Home by detaching its own credential. Started
  server seats remain fixed; Room reuse and extended post-game lifecycle are not part of Goal B.
- AI is deterministic, heuristic, and bounded. It does not learn, search exhaustively, or claim
  optimal play; one-for-one offers and one minimal counter keep domestic negotiation finite.
- The mobile/tablet board fits its full topology and stacks controls vertically; V1 has no board
  pan/zoom gesture.
- The optimized entry chunk is approximately 811 kB before transport compression because the full
  offline engine, MUI application, realtime validators, and Socket.IO client load together. Vite
  reports this as an advisory, not a failure.
- Release E2E targets the pinned Playwright Chromium build. Other evergreen browsers receive normal
  responsive/browser smoke coverage rather than a dedicated automated project.
- The 100-game invariant corpus is deliberately separate from ordinary tests and can take several
  minutes on a CPU-constrained machine.
- Static deployment configuration is present, but no live site was published during Stage 17.
