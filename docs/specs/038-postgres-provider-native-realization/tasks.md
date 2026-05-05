# Tasks: Postgres Provider-Native Realization

## Test-First

- [ ] DEP-RES-PG-NATIVE-001: add failing core/application tests for accepted managed Postgres
  realization with durable attempt state.
- [ ] DEP-RES-PG-NATIVE-002: add failing tests for provider realization success and safe read-model
  output.
- [ ] DEP-RES-PG-NATIVE-003: add failing tests for provider realization failure preserving accepted
  command semantics.
- [ ] DEP-RES-PG-NATIVE-004: add failing bind admission tests for pending/failed/unsupported managed
  Postgres.
- [ ] DEP-RES-PG-NATIVE-005 and DEP-RES-PG-NATIVE-006: add failing managed delete safety and provider
  cleanup tests.
- [ ] DEP-RES-PG-NATIVE-007: add failing unsupported-provider tests.
- [ ] DEP-RES-PG-NATIVE-008: add operation catalog/contract/entrypoint tests if schemas change.
- [ ] Add PG/PGlite persistence tests for realization state and safe read models.

## Source Of Truth

- [x] Create `docs/specs/038-postgres-provider-native-realization/spec.md`.
- [x] Create `docs/specs/038-postgres-provider-native-realization/plan.md`.
- [x] Create `docs/specs/038-postgres-provider-native-realization/tasks.md`.
- [x] Update `docs/testing/dependency-resource-test-matrix.md`.
- [x] Update `docs/workflows/dependency-resource-lifecycle.md`.
- [x] Update `docs/DOMAIN_MODEL.md`.
- [x] Update `docs/BUSINESS_OPERATION_MAP.md`.
- [x] Update `docs/CORE_OPERATIONS.md`.
- [x] Update `docs/PRODUCT_ROADMAP.md`.
- [ ] Add lifecycle event specs during Code Round.
- [ ] Update public docs/help anchor or record explicit migration gap during Code Round.

## Implementation

- [ ] Extend `ResourceInstance` with provider-native realization state and transitions.
- [ ] Add managed Postgres provider capability ports and fake provider adapter.
- [ ] Upgrade `dependency-resources.provision-postgres` use case for realization admission.
- [ ] Upgrade binding admission to require realized ready managed Postgres.
- [ ] Upgrade `dependency-resources.delete` for managed provider cleanup after safety checks.
- [ ] Extend persistence, testkit, read models, and contracts with safe realization metadata.

## Entrypoints And Docs

- [ ] Reuse or extend CLI Postgres provision/delete commands.
- [ ] Reuse or extend oRPC/HTTP provision/delete routes.
- [ ] Keep operation catalog entries aligned with any schema changes.
- [ ] Record Web/public-docs migration gap or complete a Docs/Web round.

## Verification

- [ ] Run related core/application tests.
- [ ] Run PG/PGlite dependency resource tests.
- [ ] Run CLI/oRPC/HTTP tests touched by route/schema changes.
- [ ] Run operation catalog boundary tests.
- [ ] Run `bun install --frozen-lockfile`.
- [ ] Run `bun run typecheck`.
- [ ] Run `bun run lint`.

## Post-Implementation Sync

- [ ] Reconcile spec, plan, tasks, docs, tests, operation catalog, code, roadmap notes, and public
  docs/help outcome after Code Round.
