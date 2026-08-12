# Tasks: Operate And Recover Presentation

## Governance

- [x] Record owner-delegated auto-Grill decisions and rejected alternatives.
- [x] Define ADR-112, Spec 134, workflow/error contracts and stable `OPR-*` ids.
- [x] Define Test-First seams, docs outcome, rollback and public/private boundary.
- [x] Merge governance PR #1078 and mark public Ticket #1079 `ready-for-agent`.

## Test First And Implementation

- [x] RED `OPR-SELECT-001` through `OPR-PARTIAL-003` snapshot/selection tests.
- [x] RED `OPR-TUI-004` through `OPR-REFRESH-006` protocol/headless/refresh tests.
- [x] RED `OPR-READINESS-007` through `OPR-ROLLBACK-010` action admission tests.
- [x] RED `OPR-BACKUP-011` through `OPR-PROOF-013` data recovery/proof tests.
- [x] RED `OPR-NOTIFY-014` through `OPR-COMPAT-018` evidence/error/cleanup/compat tests.
- [x] Implement the public snapshot/action coordinator and `appaloft operate` headless path.
- [x] Extend the Rust/Ratatui sidecar with `operate/v1` target, section and confirmed-action flows.
- [x] Add recovery/diagnostics docs, CLI help, renderer packaging and docs-registry coverage.

## Verification And Sync

- [x] Run focused coordinator/CLI/protocol/Rust renderer tests.
- [ ] Run failed-deployment rollback and independent restore composed acceptance.
- [x] Run public lint, typecheck, test, build, packaging and docs-impact gates.
- [ ] Sync ADR/Spec/tasks/Test Matrix/workflow/errors/docs/evidence and close the Ticket.

Public implementation delivery is PR #1080 for Ticket #1079. Cloud Ticket #881 owns the two
composed-runtime journeys, final boundary review and final cross-repository sync.
