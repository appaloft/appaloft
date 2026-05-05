# Tasks: Dependency Binding Deployment Snapshot Reference Baseline

## Test-First

- [x] DEP-BIND-SNAP-REF-001: add failing core/application tests for deployment snapshots including
  active Postgres dependency binding safe references.
- [x] DEP-BIND-SNAP-REF-002: add failing tests proving snapshots, plan, and show outputs do not
  include raw secrets or materialized env values.
- [x] DEP-BIND-SNAP-REF-003: add failing test proving removed bindings are not included as active
  snapshot references.
- [x] DEP-BIND-SNAP-REF-004: add failing plan/create test for not-ready binding diagnostic behavior
  matching this spec.
- [x] DEP-BIND-SNAP-REF-005: add failing `deployments.plan` test proving read-only readiness summary
  and no deployment side effects.
- [x] DEP-BIND-SNAP-REF-006: add failing `deployments.show` test proving immutable snapshot
  references.
- [x] Add PG/PGlite persistence/read-model test if schema changes.
- [x] Add contract/schema tests if plan/show response schemas change.

## Source Of Truth

- [x] Create `docs/specs/035-dependency-binding-snapshot-reference-baseline/spec.md`.
- [x] Create `docs/specs/035-dependency-binding-snapshot-reference-baseline/plan.md`.
- [x] Create `docs/specs/035-dependency-binding-snapshot-reference-baseline/tasks.md`.
- [x] Update `docs/testing/dependency-resource-test-matrix.md`.
- [x] Update `docs/testing/deployments.create-test-matrix.md`.
- [x] Update `docs/testing/deployment-plan-preview-test-matrix.md`.
- [x] Update `docs/testing/deployments.show-test-matrix.md`.
- [x] Update `docs/workflows/dependency-resource-lifecycle.md`.
- [x] Update `docs/workflows/deployments.create.md`.
- [x] Update `docs/queries/deployments.plan.md`.
- [x] Update `docs/queries/deployments.show.md`.
- [x] Update `docs/DOMAIN_MODEL.md`.
- [x] Update `docs/BUSINESS_OPERATION_MAP.md`.
- [x] Update `docs/CORE_OPERATIONS.md` only if public operations change.
- [x] Update `packages/application/src/operation-catalog.ts` only if public operations change.

## Implementation

- [x] Extend core Deployment snapshot reference model.
- [x] Add application mapping from Resource dependency binding summaries to safe snapshot
  references.
- [x] Capture references during `deployments.create`.
- [x] Report references/readiness through `deployments.plan`.
- [x] Report immutable references through `deployments.show`.
- [x] Persist and read references in PG/PGlite.

## Entrypoints And Docs

- [x] Keep CLI/API/oRPC operation keys unchanged.
- [x] Update plan/show schemas and tests for additive fields.
- [x] Record Web/public-docs migration gap.

## Verification

- [x] Run related core/application tests.
- [x] Run PG/PGlite deployment persistence/read-model tests if schema changes.
- [x] Run deployment plan/show tests.
- [x] Run HTTP/oRPC tests if schema output changes require contract coverage.
- [x] Run operation catalog boundary tests.
- [x] Run `bun install --frozen-lockfile`.
- [x] Run `bun run typecheck`.
- [x] Run `bun run lint`.

## Post-Implementation Sync

- [x] Reconcile spec, plan, tasks, docs, tests, operation catalog, code, and roadmap notes.
