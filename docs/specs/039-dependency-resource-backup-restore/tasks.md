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

- [x] DEP-RES-BACKUP-001: add failing core/application tests for backup request acceptance.
- [x] DEP-RES-BACKUP-002: add failing tests for provider backup success and safe restore point
  output.
- [x] DEP-RES-BACKUP-003: add failing tests for post-acceptance backup failure.
- [x] DEP-RES-BACKUP-004: add failing tests for unsupported/not-ready backup admission.
- [x] DEP-RES-BACKUP-005: add failing list/show and contract tests for safe backup summaries.
- [x] DEP-RES-BACKUP-006 through DEP-RES-BACKUP-009: add failing restore admission, completion,
  failure, and blocker tests.
- [x] DEP-RES-BACKUP-010: add failing dependency resource delete-safety tests for retained backups
  and in-flight attempts.
- [x] DEP-RES-BACKUP-011: add failing operation catalog, CLI, and oRPC/HTTP dispatch tests.
- [x] Add PG/PGlite persistence tests for backup/restore state and safe read models.

## Implementation

- [x] Add `DependencyResourceBackup` aggregate/process state with value objects.
- [x] Add backup/restore provider capability ports and fake provider adapter.
- [x] Implement `dependency-resources.create-backup`.
- [x] Implement `dependency-resources.restore-backup`.
- [x] Implement `dependency-resources.list-backups` and `dependency-resources.show-backup`.
- [x] Extend dependency resource delete safety with backup retention and in-flight attempt blockers.
- [x] Extend persistence, testkit, read models, and contracts with safe backup metadata.

## Entrypoints And Docs

- [x] Add operation catalog entries.
- [x] Add CLI backup create/list/show/restore commands.
- [x] Add oRPC/HTTP routes.
- [x] Record Web/public-docs migration gap or complete a Docs/Web round.

## Verification

- [x] Run related core/application tests.
- [x] Run PG/PGlite dependency resource backup tests.
- [x] Run CLI/oRPC/HTTP tests touched by route/schema changes.
- [x] Run operation catalog boundary tests.
- [x] Run `bun install --frozen-lockfile`.
- [x] Run `bun run typecheck`.
- [x] Run `bun run lint`.

## Post-Implementation Sync

- [x] Reconcile spec, plan, tasks, docs, tests, operation catalog, code, roadmap notes, and public
  docs/help outcome after Code Round.
