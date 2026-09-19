# Frontier Isles V2 Online Multiplayer Alpha Release Checklist

Version: `2.0.0-alpha.1`. Private package contract versions remain `0.1.0`; no package publication,
protocol identifier rename or V1 save-format change is part of this release.

## Automated acceptance

The completed Goal C acceptance report records exact results and command exits. The consolidated
delivery report records all four full commit SHAs and the post-commit clean tree. A passing
checklist requires all items below; implementation alone is not acceptance.

- V2-09 exact replay, conflicting reuse, bounded retry, per-game serialization and fresh resync.
- V2-10 pause, grace/boundary, same-player resume, expired Host transfer, explicit irreversible AI
  takeover, original-token denial, closure and private-state preservation.
- V2-11 atomic SQLite commit-before-ack, exact recovery, digest-only tokens, pending decisions,
  corrupt/future/quarantined records, interrupted writes and graceful flush.
- V2-12 environment/Origin/body/depth/schema/prototype/rate/error/log/readiness controls.
- Every accepted test retained, full 2H+2AI / 3H+1AI / 4H paths, actual browser/server restarts,
  load/resource cleanup and actual non-root local production-container crash/restart smoke.
- Clean `npm ci`; explicit typecheck, lint, test, build, check, check:server, check:all, check:game,
  simulate, simulate:online, e2e:lobby, e2e:online, e2e, security, recovery, load, container and audit.
- V1 100 legal winners, 65,341 commands and exact deterministic hash `1adc49e8`.
- Wire, application views, DOM/accessibility, console, logs, traces/reports and private storage audit.
- Exactly four authorized Goal C commits, branch `feat/v2-online-multiplayer`, no push/merge/tag/deploy.

## Pending Human deployment UAT

- Operator reviews the security, persistence and deployment runbooks and private backup access.
- Deploys one instance separately, configures exact HTTPS Origin, proxy upgrades/timeouts, volume
  ownership, resource/log limits, TLS renewal, firewall and readiness monitoring.
- Runs independent real devices/browsers at desktop/tablet/mobile widths, including keyboard
  and screen-reader checks, all seating modes, reconnect/duplicate tab and latency/loss behavior.
- Exercises explicit Host replacement/closure with the participants' expectations understood.
- Performs a controlled restart while a decision is pending, resumes within the recovery window,
  and verifies private hands remain private and play continues from the exact state.
- Tests private stopped-volume backup/restore and compatible-image rollback on an isolated copy.
- Confirms no production fixture/debug/source/persistence URL is accessible and no secret appears
  in client UI, logs or publicly distributed diagnostics.

No automated local result checks these Human/external deployment items on the operator's behalf.
