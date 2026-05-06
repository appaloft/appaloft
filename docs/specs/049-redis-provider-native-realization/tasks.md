# Tasks: Redis Provider-Native Realization

## Spec Round

- [x] Create `docs/specs/049-redis-provider-native-realization/spec.md`.
- [x] Create `docs/specs/049-redis-provider-native-realization/plan.md`.
- [x] Create `docs/specs/049-redis-provider-native-realization/tasks.md`.
- [x] Update operation map, core operations, workflow notes, roadmap, command/event specs, and test
  matrices.

## Test-First Round

- [x] DEP-RES-REDIS-NATIVE-001: add application tests for accepted managed Redis
  realization with durable attempt state.
- [x] DEP-RES-REDIS-NATIVE-002: add application tests for provider realization success, safe read-model
  output, and resolvable connection refs.
- [x] DEP-RES-REDIS-NATIVE-003: add application tests for provider realization failure preserving
  accepted command semantics.
- [x] DEP-RES-REDIS-NATIVE-004: add bind admission tests for pending managed Redis; failed,
  deleted, and unresolved-ref variants remain covered by generic readiness behavior and need broader
  matrix coverage.
- [x] DEP-RES-REDIS-NATIVE-005: add application binding tests for realized ready managed Redis;
  runtime-injection tests remain open.
- [ ] DEP-RES-REDIS-NATIVE-006 and DEP-RES-REDIS-NATIVE-007: add full managed delete safety and
  provider cleanup coverage.
- [x] DEP-RES-REDIS-NATIVE-006: add managed Redis provider cleanup tests.
- [x] DEP-RES-REDIS-NATIVE-008: add unsupported-provider tests.
- [ ] DEP-RES-REDIS-NATIVE-009: add operation catalog/contract/entrypoint tests if schemas change.
- [ ] Add PG/PGlite persistence tests for Redis realization state and safe read models.

## Code Round

- [x] Extend `ResourceInstance` with any Redis-specific provider-native realization invariants not
  covered by existing generic state.
- [x] Add managed Redis provider capability ports and fake provider adapter.
- [x] Upgrade `dependency-resources.provision-redis` use case for realization admission.
- [ ] Store new Appaloft-owned Redis connection values through `DependencyResourceSecretStore`
  before binding readiness becomes ready; this Code Round validates existing Appaloft-owned refs and
  provider-owned refs only.
- [x] Upgrade binding admission to allow realized ready managed Redis and block not-ready refs.
- [x] Upgrade `dependency-resources.delete` for managed Redis provider cleanup after safety checks.
- [ ] Extend persistence and contracts with safe Redis realization metadata. Testkit and in-memory
  read models are covered by this Code Round.

## Entrypoints And Docs

- [ ] Reuse or extend CLI Redis provision/delete/bind commands.
- [ ] Reuse or extend oRPC/HTTP Redis provision/delete/bind routes.
- [ ] Keep operation catalog entries aligned with any schema changes.
- [ ] Update public docs/help anchors or record explicit Web/public-docs migration gaps.

## Verification

- [x] Run related application tests.
- [ ] Run PG/PGlite dependency resource tests.
- [ ] Run runtime adapter tests for `REDIS_URL` materialization if touched.
- [ ] Run CLI/oRPC/HTTP tests touched by route/schema changes.
- [ ] Run operation catalog boundary tests.
- [ ] Run `bun run lint`.
- [ ] Run `bun turbo run typecheck`.
- [ ] Run `git diff --check`.

## Post-Implementation Sync

- [x] Reconcile spec, plan, tasks, docs, tests, operation catalog, code, roadmap notes, and public
  docs/help outcome after Code Round.
- [ ] Update `docs/PRODUCT_ROADMAP.md` Redis closed-loop exit criterion only after the full
  provision/import -> bind -> deploy -> observe -> backup/restore or delete loop is verified.
