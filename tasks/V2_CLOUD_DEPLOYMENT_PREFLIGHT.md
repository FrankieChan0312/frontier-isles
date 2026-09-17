# Cloud deployment preflight remediation

Authorized by the attached local-only `/goal` on 2026-09-17. Accepted clean baseline:
`feat/v2-mysql-persistence` at `348d203054a0dceb85e2a1f464b4bd039e2a5399`.
Work on `fix/v2-cloud-deployment-preflight` with coherent local commits.

Read PRODUCT_SCOPE, GAME_RULES, ARCHITECTURE, V2_MYSQL_PROGRESS, V2_DEPLOYMENT,
V2_SECURITY, V2_PERSISTENCE_RECOVERY and ADR-V2-0012/0013/0014/0015 plus the
read-only preflight findings. Preserve historical evidence.

Resolve only these blockers:

1. Production MySQL startup must not depend on a SQLite file; retain SQLite
   confinement, static-root validation and public traversal protection.
2. Add explicit production MySQL Compose/environment/CA wiring without an unused
   SQLite volume; preserve the existing local SQLite reference.
3. Separate one-shot privileged bootstrap/schema auditing from restricted runtime
   DML, with real distinct-account verification and no privileged HTTP process.
4. Prepare exact Vercel split-origin realtime URL and CSP/security headers.
5. Prepare a single Linux boot mechanism, bounded container restart policy and
   explicit unhealthy/fail-closed operator recovery.

Qualify the actual production image with isolated owned local MySQL, production
configuration, no SQLite file, recovery, exact retained replay and private artifacts.
Run all requested repository/MySQL/browser/simulation/audit gates and final check;
V1 hash remains `1adc49e8`. No skipped/unavailable gate counts as passing. At most
three normal repairs per distinct failure class; never weaken a security boundary.

No cloud/VPS account access, billable resource, TLS certificate creation, image publication,
push, merge, tag or deployment. No new engine/AI/UI/protocol/distributed feature.
Disposable local test certificate creation awaits clarification of the explicit
certificate prohibition versus the requested isolated TLS qualification.
Cloud execution, RDS TLS/backup/PITR, public HTTPS/WSS, DNS and EC2 reboot remain
unverified. Final worktree must be clean.
