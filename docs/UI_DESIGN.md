# Frontier Isles V1 UI Design

## Screens

V1 uses local presentation state instead of a routing dependency.

- **Home / New Game** collects the Human name and an explicit displayed seed, starts a game,
  continues the valid latest save, deletes that save, and presents concise original rules.
- **Game** presents the public board, players, private Human hand, phase, roll, awards, legal actions,
  redacted log, save/AI/error state, and new-game controls.

The browser seed factory uses Web Crypto only to materialize a visible seed string. The explicit
string is passed into and saved with the deterministic engine. Tests inject fixed seed factories.

## Authority and privacy

React subscribes to `GameGateway` and stores only `PlayerView` plus `PlayerEventView`. It never
receives the authoritative save envelope. Opponent presentation contains resource/development card
counts, public score, played guards, controller profile, and public awards only. Opponent resource
composition, development-card identities, authoritative deck order, and RNG state are absent from
component props, DOM labels, log messages, and errors.

The UI command controller consumes exact legal target arrays. It constructs setup/build/robber board
commands only for IDs present in those projections. MUI action buttons render from projected flags
and option lists. `LocalGameGateway` and `GameEngine` remain the final legality authority.

## Complete Human workflows

- Initial settlement and road: keyboard/click SVG targets.
- Turn lifecycle: roll, action controls, end turn.
- Seven: exact-count resource editor, highlighted robber tile, named eligible victim buttons.
- Building: road, settlement, and city modes expose only projected SVG targets.
- Development: buy and play projected card IDs; invention and monopoly use projected choices;
  Road Building uses projected edges and supports legal early finish.
- The private Development Cards section names every owned card, explains its original effect, and
  shows bought-this-turn, playable, already-played, or hidden/revealed Victory Point status. Only
  non-Victory-Point cards have Play controls; unavailable controls include a projected reason.
- Bank / Supply: a responsive public panel always shows all five resource counts, including zero,
  plus only the number of Development Cards remaining. Values come directly from the latest
  `PlayerView.publicGame.bank` and update after accepted gateway commands and save reloads.
- Maritime trade: choose one projected give/receive/ratio option.
- Domestic trade: choose projected AI counterparty and explicit resource bundles; accept, reject, or
  submit a one-depth counter to incoming offers. A counter replaces both complete bundles under the
  fixed labels `AI gives / You receive` and `You give / AI receives`. Only the Human-authored
  outgoing bundle receives a hand-based maximum; requested AI quantities expose no private cap.
- Game lifecycle: autosave status, manual save, same-seed restart when started locally, continue,
  delete save, victory dialog, and return to new game.

## SVG layers

The playable board retains the accepted coordinate projection and layers:

1. ocean background;
2. original terrain colors and number tokens;
3. original port markers;
4. public roads;
5. public settlements and cities;
6. robber;
7. engine-projected interactive targets.

Interactive `<g>` elements have accessible names, `role="button"`, `tabIndex="0"`, focus styling,
and Enter/Space activation. MUI dialogs provide focus containment and restoration.

## Responsive and motion behavior

The layout is a three-column desktop grid, collapses to a single column below the large breakpoint,
and keeps every column at `minmax(0, 1fr)` to prevent intrinsic SVG overflow. Header controls wrap.
The document and root forbid horizontal page overflow; at 480px the board remains fluid. A global
`prefers-reduced-motion` rule removes nonessential animation and transition duration.

Browser verification covered 1440×900, 1024×768, and 480×800. At every breakpoint, measured
document scroll width equalled client width, the SVG stayed inside the content column, header
buttons stayed in bounds, and the console contained no warnings or errors.
