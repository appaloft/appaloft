# Tasks: Redis Dependency Resource Lifecycle

## Test-First

- [x] DEP-RES-REDIS-PROVISION-001: add failing core/application tests for managed Redis creation.
- [x] DEP-RES-REDIS-IMPORT-001 and DEP-RES-REDIS-READ-002: add failing tests proving imported
  external Redis read models mask raw connection secrets.
- [x] DEP-RES-REDIS-VALIDATION-001: add failing tests for invalid name/slug/host/port/database/TLS
  input.
- [x] DEP-RES-REDIS-READ-001: add failing list/show read-model tests for mixed Postgres and Redis
  dependency resources.
- [x] DEP-RES-REDIS-RENAME-001: add failing rename test for Redis.
- [x] DEP-RES-REDIS-DELETE-001..002: add failing delete safety tests for imported and unsafe Redis.
- [x] DEP-RES-REDIS-ENTRY-001: add failing operation catalog, CLI, and HTTP/oRPC dispatch tests.
- [x] Add PG/PGlite persistence/read-model tests for Redis dependency resource schema.
- [x] Add contract/schema tests for Redis dependency resource summaries and responses.

## Source Of Truth

- [x] Create `docs/specs/037-redis-dependency-resource-lifecycle/spec.md`.
- [x] Create `docs/specs/037-redis-dependency-resource-lifecycle/plan.md`.
- [x] Create `docs/specs/037-redis-dependency-resource-lifecycle/tasks.md`.
- [x] Create `docs/commands/dependency-resources.provision-redis.md`.
- [x] Create `docs/commands/dependency-resources.import-redis.md`.
- [x] Update `docs/testing/dependency-resource-test-matrix.md`.
- [x] Update `docs/workflows/dependency-resource-lifecycle.md`.
- [x] Update `docs/DOMAIN_MODEL.md`.
- [x] Update `docs/BUSINESS_OPERATION_MAP.md`.
- [x] Update `docs/CORE_OPERATIONS.md` accepted-candidate note.
- [x] Update `docs/PRODUCT_ROADMAP.md`.
- [x] Add implemented operation rows in `docs/CORE_OPERATIONS.md` and
  `packages/application/src/operation-catalog.ts` during Code Round when commands become active.

## Implementation

- [x] Extend core dependency-resource model with Redis endpoint metadata and factory.
- [x] Add application Redis provision/import commands, schemas, handlers, and use cases.
- [x] Extend dependency resource ports/read models/testkit adapters to include Redis.
- [x] Add PG/PGlite migration, schema mapping, repository mapping, and read-model projection.
- [x] Extend list/show/rename/delete behavior and schemas to accept Redis safely.

## Entrypoints And Docs

- [x] Add CLI Redis dependency commands.
- [x] Add oRPC/HTTP Redis routes.
- [x] Record Web/public-docs migration gap or complete a Docs/Web round.

## Verification

- [x] Run related core/application tests.
- [x] Run PG/PGlite dependency resource tests.
- [x] Run CLI/oRPC/HTTP tests touched by routes.
- [x] Run operation catalog boundary tests.
- [x] Run `bun install --frozen-lockfile`.
- [x] Run `bun run typecheck`.
- [x] Run `bun run lint`.

## Post-Implementation Sync

- [x] Reconcile spec, plan, tasks, docs, tests, operation catalog, code, roadmap notes, and public
  docs/help outcome.
