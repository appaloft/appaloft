# Tasks: Scheduled History Retention Automation

## Spec Round

- [x] Add ADR-061 and decision index entry.
- [x] Add `docs/specs/067-scheduled-history-retention-automation/` feature artifacts.
- [x] Position scheduled history retention in `docs/BUSINESS_OPERATION_MAP.md`.
- [x] Add `docs/testing/scheduled-history-retention-test-matrix.md`.
- [x] Keep roadmap audit/event retention item open until implementation and verification exist.

## Test-First

- [x] SCHED-HISTORY-RETENTION-001: add application test proving dry-run default dispatch from
  retention defaults.
- [x] SCHED-HISTORY-RETENTION-002: add application test proving destructive scheduling is
  category-policy-gated.
- [x] SCHED-HISTORY-RETENTION-003: add tests proving category-specific guards still win during
  scheduled dispatch.
- [x] SCHED-HISTORY-RETENTION-004: add durable process visibility tests for accepted, succeeded,
  and retry-scheduled scheduled retention work; rely on existing operator-work lifecycle tests for
  dead-letter, cancel, and recovered transitions.
- [x] SCHED-HISTORY-RETENTION-005: add unsupported-category skip test for categories not yet wired.
- [x] SCHED-HISTORY-RETENTION-006: add entrypoint/docs exception tests or coverage notes when no new
  public scheduled command enters scope.

## Implementation

- [x] Add scheduled history retention application service.
- [x] Map supported retention default categories to existing prune command messages.
- [x] Record durable process attempts before command dispatch.
- [x] Complete process attempts with safe details after command success/failure.
- [x] Add disabled-by-default shell runner and config wiring.
- [x] Reuse retention default repository/read model; add no duplicate policy store.

## Entrypoints And Docs

- [x] Keep public surfaces at `retention-defaults.*`, manual prune commands, and `operator-work.*`
  unless a governed public scheduled-retention entrypoint enters scope.
- [x] Link public docs/help to existing retention defaults, manual prune, and operator work anchors.
- [x] Keep Web maintenance write controls out of this worker slice; expose configured worker status
  only through governed diagnostics/status surfaces.

## Verification

- [x] Run focused application tests.
- [x] Run shell runner tests.
- [x] Run operation catalog/docs-registry/OpenAPI tests only if public surfaces change.
- [x] Run typecheck and lint.
- [x] Run `git diff --check`.

## Post-Implementation Sync

- [x] Reconcile ADR-061, feature artifacts, roadmap, operation map, test matrix, docs/help, code,
  tests, and governed follow-ups.
