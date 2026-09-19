# Active task: asynchronous authoritative persistence

Authorized by the attached `/goal` on 2026-09-17. Starting branch
`feat/v2-mysql-persistence`, exact clean HEAD
`ee6546c469c5389afd4b7f868764843e02b4709d`.

Remove the synchronous MySQL worker bridge. Make the production repository contract
Promise-based and await direct mysql2 transactions before publishing or acknowledging
candidate state. Serialize each Room's lobby, game, AI and lifecycle work without a
global Room lock. Preserve immediate transport safety, exact state/RNG, retained result
replay, privacy, SQLite semantics, quarantine, schema validation and stale-write guards.

Required reading: PRODUCT_SCOPE, GAME_RULES, ARCHITECTURE, V2_MYSQL_PROGRESS (full),
V2_PERSISTENCE_RECOVERY and ADR-V2-0005/0007/0010/0011/0012/0013/0014. The asynchronous
follow-up decision is recorded in ADR-V2-0015. No game rules, AI strategy, public wire
contracts, browser flow, distributed infrastructure or future product feature is authorized.

Qualify against the existing SQLite and real MySQL recovery/security/browser/simulation
gates. Add controlled test-only database latency proving timer, HTTP, Socket.IO heartbeat
and unrelated Room progress, while retaining commit-before-publication/ACK and per-Room
serialization. Record measurements; do not describe local injection as RDS qualification.

Run typecheck, lint, test, build and final aggregate checks, MySQL integration/restart,
both simulation scripts (V1 hash `1adc49e8`), all browser tests and artifact audits. No
skipped/unrun gate counts as passing. Inspect precise failures and make at most three
normal repair attempts per failure class without weakening assertions or requirements.

Update architecture/recovery/progress documents without erasing historical evidence.
Make small coherent local commits and finish clean. No deployment, push, merge, tag,
cloud access, production database access or external account work is authorized.
