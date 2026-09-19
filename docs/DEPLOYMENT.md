# Deployment

The V2 alpha single-image Node/Socket.IO/SQLite reference, environment, local smoke, reverse proxy,
private volume, backup/restore and rollback procedures are in [V2 Deployment](v2/V2_DEPLOYMENT.md).
The static V1 instructions below remain valid for a Single Player-only artifact.

## Release artifact

The accepted Single Player path remains a static Vite application and requires no backend,
database, account, secret, runtime environment variable, or server-side rendering. Online Lobby
requires the separate long-running Node/Socket.IO process and a build-time `VITE_REALTIME_URL`;
Goal A does not publish or add a production deployment.

```sh
npm ci
npm run check
npm run build
```

Publish the generated `dist/` directory. `netlify.toml` supplies the build command, output folder,
Node version, immutable asset caching, and browser security headers for Netlify-compatible static
hosting. No client-side router fallback is required.

Equivalent static hosts should use:

- Build command: `npm run build`
- Publish directory: `dist`
- Node.js: 24
- Environment variables: none for Single Player; `VITE_REALTIME_URL` when enabling Online Lobby

## Verification after publishing

1. Open the Home screen over HTTPS and start a fixed-seed game.
2. Confirm AI setup advances to the Human placement boundary.
3. Place one settlement and road with keyboard input.
4. Save, reload the page, and continue the game.
5. Confirm no browser console errors and no horizontal overflow at 480px width.
6. Confirm the response headers from `netlify.toml` are present.

Saves are origin-specific localStorage data. Moving to another hostname, subdomain, port, or browser
does not move an existing save. Static hosts should preserve asset filenames and serve `index.html`
without caching it indefinitely.

## Authorization boundary

This repository contains deployment configuration only. Stage 17 did not find or create an
authorized live target, publish credentials, or deployment account, so no live deployment was
attempted. Connecting a site or running a provider deploy remains an explicit owner action.
