# Known Limitations

- V1 is a single-device, four-player game with exactly one Human and three local AI players. There
  is no backend, online multiplayer, login, cloud save, spectator mode, or cross-device resume.
- One latest save is stored in localStorage for the current browser origin. It is not encrypted or
  tamper-proof and disappears if the user clears site data.
- The browser save contains authoritative offline state by necessity. Hidden data is excluded from
  `PlayerView`, events, Zustand stores, React props, and rendered UI, but a device owner can inspect
  their own localStorage with developer tools.
- AI is deterministic, heuristic, and bounded. It does not learn, search exhaustively, or claim
  optimal play; one-for-one offers and one minimal counter keep domestic negotiation finite.
- The mobile/tablet board fits its full topology and stacks controls vertically; V1 has no board
  pan/zoom gesture.
- The optimized entry chunk is approximately 624 kB before transport compression because the full
  offline engine and MUI application load together. Vite reports this as an advisory, not a failure.
- Release E2E targets the pinned Playwright Chromium build. Other evergreen browsers receive normal
  responsive/browser smoke coverage rather than a dedicated automated project.
- The 100-game invariant corpus is deliberately separate from ordinary tests and can take several
  minutes on a CPU-constrained machine.
- Static deployment configuration is present, but no live site was published during Stage 17.
