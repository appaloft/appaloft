# Tasks: Postgres Dependency Resource Lifecycle

## Test-First

- [x] DEP-RES-PG-PROVISION-001: add failing core/application tests for managed Postgres creation.
- [x] DEP-RES-PG-IMPORT-001 and DEP-RES-PG-READ-002: add failing tests proving imported external
  Postgres read models mask raw connection secrets.
- [x] DEP-RES-PG-VALIDATION-001: add failing tests for invalid name/slug/endpoint.
- [x] DEP-RES-PG-READ-001: add failing list/show read-model tests.
- [x] DEP-RES-PG-RENAME-001: add failing rename test.
- [x] DEP-RES-PG-DELETE-001..004: add failing delete safety tests.
- [x] DEP-RES-PG-ENTRY-001: add failing operation catalog and CLI dispatch tests.
- [x] DEP-RES-PG-ENTRY-002: add failing oRPC/HTTP dispatch tests.
- [x] Add PG/PGlite persistence test for dependency resource schema/read model.

## Source Of Truth

- [x] Create `docs/specs/033-postgres-dependency-resource-lifecycle/spec.md`.
- [x] Create `docs/specs/033-postgres-dependency-resource-lifecycle/plan.md`.
- [x] Create `docs/specs/033-postgres-dependency-resource-lifecycle/tasks.md`.
- [x] Update `docs/testing/dependency-resource-test-matrix.md`.
- [x] Update `docs/workflows/dependency-resource-lifecycle.md`.
- [x] Update `docs/DOMAIN_MODEL.md`.
- [x] Update `docs/BUSINESS_OPERATION_MAP.md`.
- [x] Update `docs/CORE_OPERATIONS.md`.
- [x] Update `packages/application/src/operation-catalog.ts`.

## Implementation

- [x] Extend core dependency-resource model and specs.
- [x] Add application commands/queries/use cases/query services/handlers.
- [x] Add repository/read-model ports and testkit memory adapters.
- [x] Add PG/PGlite migration, schema, repository, and read model.

## Entrypoints And Docs

- [x] Add CLI dependency commands.
- [x] Add oRPC/HTTP procedures/routes.
- [x] Record Web/public-docs migration gap.

## Verification

- [x] Run related core/application tests.
- [x] Run PG/PGlite dependency resource test.
- [x] Run CLI/oRPC/HTTP tests touched by routes.
- [x] Run operation catalog boundary tests.
- [x] Run `bun install --frozen-lockfile`.
- [x] Run `bun run typecheck`.
- [x] Run `bun run lint`.

## Post-Implementation Sync

- [x] Reconcile spec, plan, tasks, docs, tests, operation catalog, code, and roadmap notes.
