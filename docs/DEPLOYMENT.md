# Deployment

## Release artifact

Frontier Isles is a static Vite application. It requires no backend, database, account, secret,
runtime environment variable, or server-side rendering.

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
- Environment variables: none

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
