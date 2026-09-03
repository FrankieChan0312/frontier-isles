# Testing

## Quality layers

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | Strict-check application, Node configuration, and Playwright TypeScript. |
| `npm run lint` | Lint all source, tests, scripts, and configuration with zero warnings. |
| `npm run test` | Run focused domain, engine, projection, AI, gateway, persistence, store, and UI tests. |
| `npm run build` | Type-check and produce the optimized static application in `dist/`. |
| `npm run check` | Run typecheck, lint, unit/integration tests, and production build in sequence. |
| `npm run simulate` | Run the separate 100-game deterministic release corpus. |
| `npm run e2e` | Run the Chromium browser release paths with Playwright. |

## Deterministic release simulation

`npm run simulate` runs the fixed seeds `V1-RELEASE-001` through `V1-RELEASE-100` with rotating
Merchant, Builder, and Sentinel profiles. The harness routes every decision through `GameEngine`,
creates a fresh redacted view for the acting AI, and applies the complete resource, card, piece,
board, score, award, state-version, and RNG invariant chain after every accepted command.

Safety bounds are 100 AI commands per player turn, 20,000 commands per game, 2,000 turns per game,
and 12 identical command keys in one turn. A failure reports the seed, state version, turn, phase,
actor, command key, and violation or diagnostic. A successful run prints every game summary plus an
ordered deterministic hash.

The Stage 17 qualification run completed 100/100 legal games with 65,341 commands, at most 996
commands, 170 turns, and 467 RNG draws in a game. Winner counts were East 33, West 21, South 28,
and North 18. The ordered summary hash was `1adc49e8`.

The smaller development corpora remain available as `npm run simulate:core -- 32` and
`npm run simulate:mixed -- 32`.

## Browser E2E

Install the pinned Playwright Chromium build once on a machine:

```sh
npx playwright install chromium
```

Then run:

```sh
npm run e2e
```

Playwright starts a private Vite server on `127.0.0.1:4173`, uses one Chromium worker, records a
trace on failure, and takes failure-only screenshots. The suite covers seeded creation, all Human
setup interactions, roll/end, a paid build, a controlled seven, maritime trade, AI domestic
negotiation, save/reload, deterministic victory, starting again, a 480px overflow smoke check,
accessible roles/names, and browser console/page errors.

Long setup paths use schema-valid localStorage saves constructed with accepted engine test helpers
and serialized through the production save format. No fixture switch, debug route, or test backdoor
is compiled into production code.
