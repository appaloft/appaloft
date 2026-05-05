# Tasks: Dependency Resource Binding Baseline

## Test-First

- [x] DEP-BIND-PG-BIND-001: add failing core/application tests for binding a Postgres dependency
  resource to a Resource.
- [x] DEP-BIND-PG-BIND-002 and DEP-BIND-PG-BIND-003: add failing admission tests for cross-context,
  missing, inactive, or not-bindable participants.
- [x] DEP-BIND-PG-BIND-004: add failing duplicate active binding test.
- [x] DEP-BIND-PG-READ-001 and DEP-BIND-PG-READ-002: add failing list/show tests proving safe,
  masked summaries.
- [x] DEP-BIND-PG-UNBIND-001 and DEP-BIND-PG-DELETE-002: add failing unbind tests proving
  dependency resources and external databases are not deleted.
- [x] DEP-BIND-PG-DELETE-001: add failing dependency resource delete-safety test backed by real
  active binding metadata.
- [x] DEP-BIND-PG-ENTRY-001: add failing operation catalog and CLI dispatch tests.
- [x] Add failing oRPC/HTTP dispatch tests for bind/unbind/list/show.
- [x] Add PG/PGlite persistence and read-model tests if schema changes.

## Source Of Truth

- [x] Create `docs/specs/034-dependency-resource-binding-baseline/spec.md`.
- [x] Create `docs/specs/034-dependency-resource-binding-baseline/plan.md`.
- [x] Create `docs/specs/034-dependency-resource-binding-baseline/tasks.md`.
- [x] Update `docs/testing/dependency-resource-test-matrix.md`.
- [x] Update `docs/workflows/dependency-resource-lifecycle.md`.
- [x] Update `docs/DOMAIN_MODEL.md`.
- [x] Update `docs/BUSINESS_OPERATION_MAP.md`.
- [x] Update `docs/CORE_OPERATIONS.md`.
- [x] Update `packages/application/src/operation-catalog.ts`.

## Implementation

- [x] Extend core ResourceBinding model and specs.
- [x] Add application commands/queries/use cases/query services/handlers.
- [x] Add repository/read-model ports and testkit memory adapters.
- [x] Add PG/PGlite migration, schema, repository, read model, and delete-safety reader.

## Entrypoints And Docs

- [x] Add CLI Resource dependency binding commands.
- [x] Add oRPC/HTTP procedures/routes.
- [x] Record Web/public-docs migration gap.

## Verification

- [x] Run related core/application tests.
- [x] Run PG/PGlite dependency binding test.
- [x] Run CLI/oRPC/HTTP tests touched by routes.
- [x] Run operation catalog boundary tests.
- [x] Run `bun install --frozen-lockfile`.
- [x] Run `bun run typecheck`.
- [x] Run `bun run lint`.

## Post-Implementation Sync

- [x] Reconcile spec, plan, tasks, docs, tests, operation catalog, code, and roadmap notes.
