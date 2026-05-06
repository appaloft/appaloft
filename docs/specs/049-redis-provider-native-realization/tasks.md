# Tasks: Redis Provider-Native Realization

## Spec Round

- [x] Create `docs/specs/049-redis-provider-native-realization/spec.md`.
- [x] Create `docs/specs/049-redis-provider-native-realization/plan.md`.
- [x] Create `docs/specs/049-redis-provider-native-realization/tasks.md`.
- [x] Update operation map, core operations, workflow notes, roadmap, command/event specs, and test
  matrices.

## Test-First Round

- [ ] DEP-RES-REDIS-NATIVE-001: add failing core/application tests for accepted managed Redis
  realization with durable attempt state.
- [ ] DEP-RES-REDIS-NATIVE-002: add failing tests for provider realization success, safe read-model
  output, and resolvable connection refs.
- [ ] DEP-RES-REDIS-NATIVE-003: add failing tests for provider realization failure preserving
  accepted command semantics.
- [ ] DEP-RES-REDIS-NATIVE-004: add failing bind admission tests for pending/failed/unsupported,
  deleted, or unresolved-ref managed Redis.
- [ ] DEP-RES-REDIS-NATIVE-005: add failing binding/runtime-injection tests for realized ready
  managed Redis.
- [ ] DEP-RES-REDIS-NATIVE-006 and DEP-RES-REDIS-NATIVE-007: add failing managed delete safety and
  provider cleanup tests.
- [ ] DEP-RES-REDIS-NATIVE-008: add failing unsupported-provider tests.
- [ ] DEP-RES-REDIS-NATIVE-009: add operation catalog/contract/entrypoint tests if schemas change.
- [ ] Add PG/PGlite persistence tests for Redis realization state and safe read models.

## Code Round

- [ ] Extend `ResourceInstance` with any Redis-specific provider-native realization invariants not
  covered by existing generic state.
- [ ] Add managed Redis provider capability ports and fake provider adapter.
- [ ] Upgrade `dependency-resources.provision-redis` use case for realization admission.
- [ ] Store Appaloft-owned Redis connection values through `DependencyResourceSecretStore` before
  binding readiness becomes ready.
- [ ] Upgrade binding admission to allow realized ready managed Redis and block unresolved refs.
- [ ] Upgrade `dependency-resources.delete` for managed Redis provider cleanup after safety checks.
- [ ] Extend persistence, testkit, read models, and contracts with safe Redis realization metadata.

## Entrypoints And Docs

- [ ] Reuse or extend CLI Redis provision/delete/bind commands.
- [ ] Reuse or extend oRPC/HTTP Redis provision/delete/bind routes.
- [ ] Keep operation catalog entries aligned with any schema changes.
- [ ] Update public docs/help anchors or record explicit Web/public-docs migration gaps.

## Verification

- [ ] Run related core/application tests.
- [ ] Run PG/PGlite dependency resource tests.
- [ ] Run runtime adapter tests for `REDIS_URL` materialization if touched.
- [ ] Run CLI/oRPC/HTTP tests touched by route/schema changes.
- [ ] Run operation catalog boundary tests.
- [ ] Run `bun run lint`.
- [ ] Run `bun turbo run typecheck`.
- [ ] Run `git diff --check`.

## Post-Implementation Sync

- [ ] Reconcile spec, plan, tasks, docs, tests, operation catalog, code, roadmap notes, and public
  docs/help outcome after Code Round.
- [ ] Update `docs/PRODUCT_ROADMAP.md` Redis closed-loop exit criterion only after the full
  provision/import -> bind -> deploy -> observe -> backup/restore or delete loop is verified.
