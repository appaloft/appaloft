# Tasks: Deployment Rollback

## Spec Round

- [x] Locate rollback in `docs/BUSINESS_OPERATION_MAP.md`.
- [x] Read ADR-016 and ADR-034.
- [x] Confirm no new ADR is required for rollback Code Round.
- [x] Create `docs/specs/041-deployment-rollback/spec.md`.
- [x] Create `docs/specs/041-deployment-rollback/plan.md`.
- [x] Create `docs/specs/041-deployment-rollback/tasks.md`.
- [x] Reconcile command spec, recovery test matrix, implementation plan, public docs, and roadmap
  notes for Code Round readiness.

## Test-First Round

- [x] Add core tests for rollback trigger/source/candidate metadata.
- [x] Add application tests for `DEP-ROLLBACK-001` through `DEP-ROLLBACK-005`.
- [x] Add PG/PGlite persistence tests for rollback trigger/source/candidate metadata.
- [x] Add CLI and oRPC/HTTP dispatch tests for `DEP-ROLLBACK-ENTRY-001`.
- [x] Add Web semantic/browser tests for candidate selection and rollback action gating.
- [x] Add regression tests proving retry/redeploy remain active after rollback activation.

## Implementation

- [x] Add `rollbackCandidateDeploymentId` value-object-backed state to `Deployment`.
- [x] Add deployment factory helper for rollback attempt creation.
- [x] Add rollback orchestration from selected candidate runtime plan, environment snapshot, target/
  destination ids, dependency binding snapshot references, and retained artifact identity.
- [x] Add `RollbackDeploymentCommand`, schema, handler, use case, and tokens.
- [x] Add resource-runtime mutation coordination policy for rollback.
- [x] Persist rollback metadata in PG and memory testkit repositories/read models.
- [x] Update recovery readiness command-active state for rollback after all entrypoints and tests are
  active.

## Entrypoints And Docs

- [x] Add operation catalog entry for `deployments.rollback`.
- [x] Update `docs/CORE_OPERATIONS.md` active command row.
- [x] Add CLI command.
- [x] Add oRPC/HTTP route.
- [x] Enable Web rollback candidate selection/action with i18n and shared readiness gating.
- [x] Update public docs/docs matrix status for active rollback command surface.
- [x] Keep stateful data rollback explicitly unsupported in public docs/help.

## Verification

- [x] Run targeted core/application rollback tests.
- [x] Run targeted PG/PGlite persistence tests.
- [ ] Run targeted CLI/oRPC/HTTP tests.
- [ ] Run targeted Web semantic/browser tests.
- [ ] Run operation catalog boundary tests.
- [ ] Run `bun install --frozen-lockfile`.
- [ ] Run `bun run typecheck`.
- [ ] Run `bun run lint`.
- [ ] Run `git diff --check`.

## Post-Implementation Sync

- [ ] Reconcile ADR-034, command specs, recovery test matrix, public docs, operation catalog, code,
  roadmap notes, and remaining rollback migration gaps after Code Round.
