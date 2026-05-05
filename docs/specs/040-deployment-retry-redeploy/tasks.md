# Tasks: Deployment Retry And Redeploy

## Spec Round

- [x] Locate retry/redeploy in `docs/BUSINESS_OPERATION_MAP.md`.
- [x] Read ADR-016 and ADR-034.
- [x] Confirm no new ADR is required for retry/redeploy Code Round.
- [x] Create `docs/specs/040-deployment-retry-redeploy/spec.md`.
- [x] Create `docs/specs/040-deployment-retry-redeploy/plan.md`.
- [x] Create `docs/specs/040-deployment-retry-redeploy/tasks.md`.
- [x] Reconcile command specs, recovery test matrix, implementation plan, and roadmap notes for
  Code Round readiness.

## Test-First Round

- [x] Add core tests for recovery trigger/source metadata value objects and deployment attempt state.
- [x] Add application tests for `DEP-RETRY-001` through `DEP-RETRY-003`.
- [x] Add application tests for `DEP-REDEPLOY-001`.
- [ ] Add coordination fixtures for `DEP-RETRY-004` and `DEP-REDEPLOY-004`.
- [ ] Add drift/invalid-profile fixtures for `DEP-REDEPLOY-002` and `DEP-REDEPLOY-003`.
- [ ] Add PG/PGlite persistence tests for recovery trigger/source metadata.
- [ ] Add CLI and oRPC/HTTP dispatch tests for `DEP-RECOVERY-ENTRY-001`.
- [x] Add Web semantic tests for retry/redeploy actions enabled only from readiness and
  operation-active state.
- [ ] Add Web browser-flow tests for retry/redeploy actions.
- [x] Add regression coverage proving rollback remains inactive in readiness/Web surfaces.

## Implementation

- [x] Add `DeploymentTriggerKindValue` and related value objects in `core`.
- [x] Extend `DeploymentState` with recovery trigger/source metadata.
- [x] Add deployment factory helpers for retry and redeploy attempt creation.
- [x] Extract shared current-profile deployment orchestration from `CreateDeploymentUseCase` so
  `deployments.create` and `deployments.redeploy` use one pipeline.
- [x] Add retry orchestration from retained source deployment runtime plan and environment snapshot.
- [x] Add `RetryDeploymentCommand`, schema, handler, use case, and tokens.
- [x] Add `RedeployDeploymentCommand`, schema, handler, use case, and tokens.
- [x] Add resource-runtime mutation coordination policies for retry and redeploy.
- [x] Persist recovery metadata in PG and memory testkit repositories/read models.
- [x] Update recovery readiness command-active state for retry/redeploy while keeping rollback
  inactive.

## Entrypoints And Docs

- [x] Add operation catalog entries for `deployments.retry` and `deployments.redeploy`.
- [x] Update `docs/CORE_OPERATIONS.md` active command rows.
- [x] Add CLI commands.
- [x] Add oRPC/HTTP routes.
- [x] Enable Web deployment recovery actions with i18n and shared readiness gating.
- [x] Update public docs/docs matrix status for active retry/redeploy command surfaces.
- [x] Keep rollback command/action unavailable until rollback Code Round.

## Verification

- [x] Run targeted core/application retry/redeploy tests.
- [ ] Run targeted PG/PGlite persistence tests.
- [x] Run targeted CLI/oRPC/HTTP tests.
- [x] Run targeted Web semantic tests.
- [ ] Run targeted Web browser-flow tests.
- [x] Run operation catalog boundary tests.
- [ ] Run `bun install --frozen-lockfile`.
- [x] Run `bun run typecheck`.
- [ ] Run `bun run lint`.
- [x] Run `git diff --check`.

## Post-Implementation Sync

- [ ] Reconcile ADR-034, command specs, recovery test matrix, public docs, operation catalog, code,
  roadmap notes, and remaining rollback migration gaps after Code Round.
