# V1 Release Checklist

This records the accepted historical V1 release. The current online prerelease is governed by
[the V2 alpha checklist](v2/V2_ALPHA_RELEASE_CHECKLIST.md); online changes do not replace V1 authority.

## Scope and architecture

- [x] One Human and three AI players use the fixed V1 ruleset.
- [x] Human and AI commands pass through the same `GameGateway` and authoritative engine.
- [x] AI, React, and Zustand receive redacted player contracts rather than unrestricted state.
- [x] Seeded RNG is the only authoritative randomness; engine logic does not use wall-clock time.
- [x] No backend, database, login, networking, multiplayer, or unauthorized deployment was added.

## Functional release paths

- [x] Setup, turns, robber, construction, development cards, awards, scoring, and victory work.
- [x] Maritime trades and bounded domestic negotiation work for Human and AI players.
- [x] Automatic/manual save, defensive load, continue, delete, and start-again flows work.
- [x] Complete responsive MUI/raw-SVG UI works at desktop, tablet, and 480px widths.
- [x] Keyboard board targets, dialog focus behavior, visible focus, and reduced motion are present.

## Verification

- [x] Strict typecheck and zero-warning lint pass.
- [x] Unit/integration/component suite passes without skipped release behavior.
- [x] Production build succeeds.
- [x] 100 fixed mixed-profile simulations produce a legal winner within documented bounds.
- [x] Five repeatable Chromium E2E paths pass without console or page errors.
- [x] `git diff --check` passes and the final committed tree is clean.

## Release review

- [x] Runtime dependencies are used by the shipped application; Playwright is development-only.
- [x] No official CATAN logos, artwork, card images, rulebook prose, or third-party game assets exist.
- [x] Production UI does not render opponent private resources/cards, deck order, or RNG state.
- [x] No `Math.random()` or UUID entropy is present in authoritative game or AI code.
- [x] Static-host configuration and exact deployment boundary are documented.

The production build currently reports a non-failing advisory for its approximately 624 kB
minified entry chunk. The bundle contains the full offline engine, React, MUI, Emotion, Zustand,
and local font assets; the release adds no unused application dependency to mask that advisory.
