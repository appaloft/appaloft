# Tasks: Operate And Recover Presentation

## Governance

- [x] Record owner-delegated auto-Grill decisions and rejected alternatives.
- [x] Define ADR-112, Spec 134, workflow/error contracts and stable `OPR-*` ids.
- [x] Define Test-First seams, docs outcome, rollback and public/private boundary.
- [ ] Merge governance PR and mark the actor-visible public Ticket `ready-for-agent`.

## Test First And Implementation

- [ ] RED `OPR-SELECT-001` through `OPR-PARTIAL-003` snapshot/selection tests.
- [ ] RED `OPR-TUI-004` through `OPR-REFRESH-006` protocol/headless/refresh tests.
- [ ] RED `OPR-READINESS-007` through `OPR-ROLLBACK-010` action admission tests.
- [ ] RED `OPR-BACKUP-011` through `OPR-PROOF-013` data recovery/proof tests.
- [ ] RED `OPR-NOTIFY-014` through `OPR-COMPAT-018` evidence/error/cleanup/compat tests.
- [ ] Implement the public snapshot/action coordinator and `appaloft operate` headless path.
- [ ] Extend the Rust/Ratatui sidecar with `operate/v1` target, section and confirmed-action flows.
- [ ] Add recovery/diagnostics docs, CLI help, renderer packaging and docs-registry coverage.

## Verification And Sync

- [ ] Run focused coordinator/CLI/protocol/Rust renderer tests.
- [ ] Run failed-deployment rollback and independent restore composed acceptance.
- [ ] Run public lint, typecheck, test, build, packaging and docs-impact gates.
- [ ] Sync ADR/Spec/tasks/Test Matrix/workflow/errors/docs/evidence and close the Ticket.
