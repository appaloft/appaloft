# Plan: Deployment Rollback

## Governing Sources

- ADRs: ADR-012, ADR-014, ADR-016, ADR-021, ADR-023, ADR-027, ADR-028, ADR-029, ADR-034
- Operation map: `docs/BUSINESS_OPERATION_MAP.md`
- Core operations: `docs/CORE_OPERATIONS.md`
- Global contracts: `docs/errors/model.md`, `docs/errors/neverthrow-conventions.md`,
  `docs/architecture/async-lifecycle-and-acceptance.md`
- Local specs:
  - `docs/commands/deployments.rollback.md`
  - `docs/queries/deployments.recovery-readiness.md`
  - `docs/errors/deployment-recovery-readiness.md`
  - `docs/workflows/deployments.create.md`
  - `docs/workflows/deployment-detail-and-observation.md`
  - `docs/testing/deployment-recovery-readiness-test-matrix.md`
- Public docs:
  - `apps/docs/src/content/docs/deploy/recovery.md`
  - `apps/docs/src/content/docs/en/deploy/recovery.md`
  - `packages/docs-registry/src/index.ts`

## Architecture Approach

### Core

- Extend `Deployment` rollback metadata with `rollbackCandidateDeploymentId` as a value object field.
- Keep `triggerKind = rollback` and `sourceDeploymentId` on the new attempt.
- Preserve source and candidate deployment records without mutation.
- Ensure lifecycle event payloads include safe rollback trigger/source/candidate metadata where
  current lifecycle event schemas already carry trigger metadata.

### Application

- Add explicit command slice:
  - `RollbackDeploymentCommand`, handler, schema, use case.
- Reuse the deployment attempt runner path created for create/retry/redeploy so rollback does not
  duplicate terminal persistence or runtime execution behavior.
- Add a rollback attempt factory that creates a new attempt from the selected candidate's retained
  runtime plan, environment snapshot, target/destination ids, dependency binding snapshot
  references, and retained runtime artifact identity.
- Re-evaluate `DeploymentRecoveryReadinessQueryService` selected-candidate policy server-side
  during admission; do not trust client readiness output.
- Add `mutationCoordinationPolicies.rollbackDeployment` using `resource-runtime` scope.
- Keep handlers thin and constructor-injected through `tokens`.

### Persistence And Read Models

- Persist `rollbackCandidateDeploymentId` in deployment storage and read models.
- Add a migration for rollback metadata without compatibility aliases because this repository is
  still before the first formal release.
- Preserve existing candidate readiness output shape unless Code Round discovers a missing retained
  artifact field that must become a public safe summary.

### Entrypoints

- Operation catalog and `CORE_OPERATIONS.md` must activate rollback in the same Code Round.
- CLI dispatches through command bus:
  - `appaloft deployments rollback <deploymentId> --candidate <rollbackCandidateDeploymentId>`
- oRPC/HTTP route reuses application schema:
  - `POST /api/deployments/{deploymentId}/rollback`
- Web recovery panel enables candidate selection/action only from readiness output plus operation
  catalog active state.
- Public docs/help links reuse existing recovery anchors and must keep stateful data rollback as an
  explicit non-goal.

## Roadmap And Compatibility

- Roadmap target: Phase 7 / `0.9.0` beta.
- Version target: not releasing in this round.
- Compatibility impact: `pre-1.0-policy`, additive command surface and output metadata.
- Release-note/changelog: required during release prep after command becomes active.

## Testing Strategy

Minimum Code Round coverage:

- Core:
  - `DEP-ROLLBACK-001`: rollback trigger/source/candidate metadata on rollback attempt state.
- Application:
  - `DEP-ROLLBACK-001`: rollback creates a new attempt from selected candidate snapshot/artifact
    state.
  - `DEP-ROLLBACK-002`: missing or wrong-resource candidate returns
    `deployment_rollback_candidate_not_found`.
  - `DEP-ROLLBACK-003`: candidate missing artifact/snapshot returns `deployment_not_rollback_ready`.
  - `DEP-ROLLBACK-004`: stale readiness marker returns `deployment_recovery_state_stale`.
  - `DEP-ROLLBACK-005`: resource-runtime coordination prevents competing recovery work.
- Persistence:
  - rollback trigger/source/candidate metadata round-trips in PG/PGlite.
- Entrypoints:
  - `DEP-ROLLBACK-ENTRY-001`: operation catalog, CLI, HTTP/oRPC, and Web dispatch explicit command.
- Regression:
  - retry/redeploy remain active and rollback no longer returns `recovery-command-not-active` only
    after the rollback Code Round activates all surfaces.

## Risks And Migration Gaps

- Existing readiness can identify rollback candidates, but Code Round must prove the runtime backend
  can execute from retained artifact identity rather than re-planning from source.
- Stateful data rollback is a product hazard. UI, CLI help, API descriptions, and public docs must
  keep the non-goal visible without leaking internal DDD/CQRS language.
- Candidate ranking may be simple most-recent-success for the first Code Round; richer pinning or
  pagination should stay out unless readiness output becomes too large.
- Runtime coordination must not bypass create/retry/redeploy supersede/fencing rules.

## Code Round Readiness

Rollback is ready for Code Round after this Spec Round because:

- ADR-016 and ADR-034 govern command boundary, candidate semantics, non-goals, and errors;
- local command and error specs exist;
- recovery readiness query already returns candidate facts and stale-readiness markers;
- this artifact records implementation placement, entrypoints, tests, and migration gaps.
