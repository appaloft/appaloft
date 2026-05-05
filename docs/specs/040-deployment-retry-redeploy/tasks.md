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

- [ ] Add core tests for recovery trigger/source metadata value objects and deployment attempt state.
- [ ] Add application tests for `DEP-RETRY-001` through `DEP-RETRY-004`.
- [ ] Add application tests for `DEP-REDEPLOY-001` through `DEP-REDEPLOY-004`.
- [ ] Add PG/PGlite persistence tests for recovery trigger/source metadata.
- [ ] Add CLI and oRPC/HTTP dispatch tests for `DEP-RECOVERY-ENTRY-001`.
- [ ] Add Web semantic/browser tests for retry/redeploy actions enabled only from readiness and
  operation-active state.
- [ ] Add regression test proving rollback remains inactive.

## Implementation

- [ ] Add `DeploymentRecoveryTriggerKind` and related value objects in `core`.
- [ ] Extend `DeploymentState` with recovery trigger/source metadata.
- [ ] Add deployment factory helpers for retry and redeploy attempt creation.
- [ ] Extract shared current-profile deployment orchestration from `CreateDeploymentUseCase` so
  `deployments.create` and `deployments.redeploy` use one pipeline.
- [ ] Add retry orchestration from retained source deployment runtime plan and environment snapshot.
- [ ] Add `RetryDeploymentCommand`, schema, handler, use case, and tokens.
- [ ] Add `RedeployDeploymentCommand`, schema, handler, use case, and tokens.
- [ ] Add resource-runtime mutation coordination policies for retry and redeploy.
- [ ] Persist recovery metadata in PG and memory testkit repositories/read models.
- [ ] Update recovery readiness command-active state for retry/redeploy while keeping rollback
  inactive.

## Entrypoints And Docs

- [x] Add operation catalog entries for `deployments.retry` and `deployments.redeploy`.
- [x] Update `docs/CORE_OPERATIONS.md` active command rows.
- [x] Add CLI commands.
- [x] Add oRPC/HTTP routes.
- [ ] Enable Web deployment recovery actions with i18n and shared readiness gating.
- [x] Update public docs/docs matrix status for active retry/redeploy command surfaces.
- [ ] Keep rollback command/action unavailable until rollback Code Round.

## Verification

- [x] Run targeted core/application retry/redeploy tests.
- [ ] Run targeted PG/PGlite persistence tests.
- [x] Run targeted CLI/oRPC/HTTP tests.
- [ ] Run targeted Web semantic/browser tests.
- [ ] Run operation catalog boundary tests.
- [ ] Run `bun install --frozen-lockfile`.
- [x] Run `bun run typecheck`.
- [ ] Run `bun run lint`.
- [ ] Run `git diff --check`.

## Post-Implementation Sync

- [ ] Reconcile ADR-034, command specs, recovery test matrix, public docs, operation catalog, code,
  roadmap notes, and remaining rollback migration gaps after Code Round.
