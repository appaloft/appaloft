# Tasks: Dependency Resource Backup And Restore

## Spec Round

- [x] Create ADR-036 for dependency resource backup/restore lifecycle ownership.
- [x] Create `docs/specs/039-dependency-resource-backup-restore/spec.md`.
- [x] Create `docs/specs/039-dependency-resource-backup-restore/plan.md`.
- [x] Create `docs/specs/039-dependency-resource-backup-restore/tasks.md`.
- [x] Update `docs/BUSINESS_OPERATION_MAP.md`.
- [x] Update `docs/CORE_OPERATIONS.md`.
- [x] Update `docs/DOMAIN_MODEL.md`.
- [x] Update global error model with new stable backup/restore error codes.
- [x] Update dependency resource workflow and test matrix.
- [x] Add command/query/event specs for planned backup/restore surfaces.
- [x] Update roadmap verification notes.

## Test-First

- [ ] DEP-RES-BACKUP-001: add failing core/application tests for backup request acceptance.
- [ ] DEP-RES-BACKUP-002: add failing tests for provider backup success and safe restore point
  output.
- [ ] DEP-RES-BACKUP-003: add failing tests for post-acceptance backup failure.
- [ ] DEP-RES-BACKUP-004: add failing tests for unsupported/not-ready backup admission.
- [ ] DEP-RES-BACKUP-005: add failing list/show and contract tests for safe backup summaries.
- [ ] DEP-RES-BACKUP-006 through DEP-RES-BACKUP-009: add failing restore admission, completion,
  failure, and blocker tests.
- [ ] DEP-RES-BACKUP-010: add failing dependency resource delete-safety tests for retained backups
  and in-flight attempts.
- [ ] DEP-RES-BACKUP-011: add failing operation catalog, CLI, and oRPC/HTTP dispatch tests.
- [ ] Add PG/PGlite persistence tests for backup/restore state and safe read models.

## Implementation

- [ ] Add `DependencyResourceBackup` aggregate/process state with value objects.
- [ ] Add backup/restore provider capability ports and fake provider adapter.
- [ ] Implement `dependency-resources.create-backup`.
- [ ] Implement `dependency-resources.restore-backup`.
- [ ] Implement `dependency-resources.list-backups` and `dependency-resources.show-backup`.
- [ ] Extend dependency resource delete safety with backup retention and in-flight attempt blockers.
- [ ] Extend persistence, testkit, read models, and contracts with safe backup metadata.

## Entrypoints And Docs

- [ ] Add operation catalog entries.
- [ ] Add CLI backup create/list/show/restore commands.
- [ ] Add oRPC/HTTP routes.
- [ ] Record Web/public-docs migration gap or complete a Docs/Web round.

## Verification

- [ ] Run related core/application tests.
- [ ] Run PG/PGlite dependency resource backup tests.
- [ ] Run CLI/oRPC/HTTP tests touched by route/schema changes.
- [ ] Run operation catalog boundary tests.
- [ ] Run `bun install --frozen-lockfile`.
- [ ] Run `bun run typecheck`.
- [ ] Run `bun run lint`.

## Post-Implementation Sync

- [ ] Reconcile spec, plan, tasks, docs, tests, operation catalog, code, roadmap notes, and public
  docs/help outcome after Code Round.
