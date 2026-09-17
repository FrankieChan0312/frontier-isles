# V2 Alpha Security Boundary

Cloud-preflight remediation adds an explicit privileged schema audit and restricted
runtime grants; [deployment templates](../../deploy/README.md) define this separation.
Do not grant TRIGGER to runtime to work around privilege-filtered metadata. The one-shot
deployment command proves visibility before checking trigger/routine/event absence and
never starts HTTP. Its credentials must not enter the normal service. Production MySQL
startup ignores SQLite paths while SQLite's lexical/realpath confinement is unchanged.
The Vercel declaration permits the exact planned HTTPS/WSS backend in frontend CSP;
the backend still admits only exact configured Origins, never wildcard preview hosts.

Dependency versions remain locked. The reviewed esbuild platform-binary installer is allowed only
for `esbuild@0.28.2` in `package.json`; future versions require another review. Its installer validates
the binary version and its fallback download integrity. No blanket install-script approval was added.
See [npm's version-pinned script policy](https://docs.npmjs.com/cli/v11/commands/npm-approve-scripts/).

The server derives Human authority from the current attached valid session. Actor/Player/Host
claims, legal actions, resources, game results, RNG and revisions supplied by clients grant no
authority. Twenty strict command schemas accept serializable intents only. Room snapshots omit
session identities and all private game data. Game updates/acknowledgements are viewer-specific;
owner-only resources/cards/decisions enter that owner's gateway and UI. Opponent projections retain
counts and public facts only. AI receives its own redacted view. Single Player authority is separate.

## Explicit local alpha limits

Token buckets use burst capacity plus the following refill rates. Global ceilings and per-transport
ceilings both apply. Values are admission bounds, not a promise that maximum load meets a latency SLO.

| Scope | Operation | Burst | Refill per second |
| --- | --- | ---: | ---: |
| Process | New connection | 128 | 8 |
| Process | All packets | 4096 | 2000 |
| Process | Create Room | 128 | 2 |
| Process | Join / resume, separately | 256 | 4 |
| Transport | All packets | 512 | 200 |
| Transport | Create Room | 6 | 0.1 |
| Transport | Join / resume, separately | 32 | 32/60 |
| Valid Human session | All packets | 512 | 200 |
| Valid Human session | Game command | 256 | 100 |

There are at most 64 Rooms, 320 attached transports and 256 valid Human session buckets. Invalid
session claims cannot create limiter entries. Leaving/expiry removes authority; pruning removes
its limiter entry. Disconnect removes transport entries; valid session entries survive resume.
Rate rejection uses `RATE_LIMITED` with a fixed public message. Room capacity uses `SERVER_BUSY`.
Denied requests do not execute commands or consume game RNG. Diagnostics coalesce repeated rate
rejections to at most one log entry per second.

Inbound limits: 16 KiB Socket.IO packets, depth 12, 512 JSON nodes; 8 KiB HTTP headers, no HTTP
request bodies, 2048-character URL, ten-second header/request limits. Strict contract schemas
retain normalized display names, six-character codes and bounded string/numeric values. Reserved
prototype keys, extra authority fields and malformed payloads fail before authoritative mutation.
Outbound private updates have at most 64 outstanding five-second receipts per socket. A slow
consumer disconnects and uses the accepted pause/resume/resync policy.

## Secrets, private data and operator access

Resume credentials are tab-scoped bearer secrets in sessionStorage. Only their owning tab receives
them; native browser duplication can copy its own credential. They are never a displayed UI value,
application log or Room broadcast. The newest valid tab replaces the previous transport. Losing
that tab/storage can lose the seat; no account recovery or Human hand transfer exists.

SQLite contains authoritative private hands, deck/RNG, session IDs, digests and bounded command
results. It is intentionally server-private, checksum protected and permission restricted, not
encrypted at rest. Protect the host/volume and backups; database readers can see every hand.
Raw ResumeTokens, sockets, callbacks, timers and IPs are not persisted. Public HTTP paths never
reach the data volume, source tree, maps or fixtures. Production logs allow only fixed codes,
counts and port. Do not enable Socket.IO/Node verbose debug logging in production.

## Audit evidence

The protocol tests reject extra fields and private-authority claims. Delivery tests inspect caches,
retries, stale views and projected private events. Presence tests prove owner-only pending choices
and AI replacement. Recovery tests compare exact private data through booleans/equality in Node,
test corrupt/future/partial stores, and verify only digests persist. Security tests attack real
Origin/payload/handler/rate boundaries and check public errors. Browser tests inspect Room/public
state, owner projections, DOM, attributes, accessibility, console and duplicate-tab behavior.

Zustand stores the gateway's validated PlayerView and delivery/lobby state; React receives those
views, never an online GameState. Socket.IO command receipts exclude private updates from the
connection recovery backlog; browser resync requests a fresh authoritative projection.

Playwright artifacts and test reports are local development evidence under ignored paths, never
static public assets. Browser traces can include an owning test player's synthetic visible hand;
they must not be shared as public multiplayer telemetry. Credential values must stay out of test
action arguments, assertion messages, attachments and console output. The final acceptance audit
records checks of actual artifacts and production logs. Do not publish raw traces or persistence.

Playwright itself retains authentication frames in traces, independently of test arguments. The
trace reporter therefore redacts ResumeToken and SessionId values in every retained ZIP text entry,
including nested network JSONL resources. It preserves screenshots, steps and failure outcomes,
checks ZIP checksums/size bounds and verifies the rewritten archive before replacing it. Redaction
failure fails the run. `npm run e2e:audit` forces trace capture; `npm run audit:artifacts` independently
checks for remaining token/session/digest/fingerprint/RNG payloads. `npm run redact:artifacts` applies
the same protection to pre-existing local evidence. No production wire payload is changed by this
test-artifact policy. Initial audit findings and their correction are retained in the progress report.

Origin is not authentication, anonymous RoomCode access is not a private invitation system, and
global rate limits are not distributed denial-of-service protection. Internet deployment requires
TLS and operator access controls. There is no account, moderation, matchmaking, chat, spectator,
ranking, cross-region service or multiple-replica support in this alpha.

The MySQL provider has the same private aggregate contents as SQLite. Protect database readers,
quarantine and backups accordingly; only digests of resume tokens are stored. Production requires
trusted CA and hostname verification (both explicitly enabled in mysql2), TLS 1.2+, a DNS endpoint,
backend-only environment credentials and a dedicated least-privilege account. Plaintext is limited
to nonproduction loopback tests. The driver runs through its Promise API without a worker bridge
or debug logging. Driver exceptions are sanitized; only fixed codes/counts enter diagnostics.
Candidate snapshots remain private until commit. Unknown schema or failed/uncertain writes fail closed.
The local harness generates disposable credentials, checks output for those values, and reuses
the existing trace redactor before retaining output. Run `npm run audit:artifacts -- server/logs`
in addition to the browser artifact audit. No RDS, AWS, Vercel, GoDaddy or VPS access is part of it.

The separately authorized production MySQL smoke creates synthetic disposable CA/server
material in a task-owned temporary directory and mounts only the CA public certificate
read-only into the application. It tests trusted-host acceptance, wrong-CA and wrong-host
rejection, and required-TLS refusal of a usable plaintext fixture. It never installs trust
globally. Generated certificates/private keys and owned containers are removed after the
run; output guards reject generated passwords, keys and session credentials before any
retention. Artifact auditing additionally rejects private-key PEM markers. See the latest
[local acceptance record](V2_MYSQL_PROGRESS.md) for actual results; none proves RDS TLS.
