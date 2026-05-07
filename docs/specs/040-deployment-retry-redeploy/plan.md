# Plan: Deployment Retry And Redeploy

## Governing Sources

- ADRs: ADR-012, ADR-014, ADR-016, ADR-021, ADR-023, ADR-027, ADR-028, ADR-029, ADR-034
- Operation map: `docs/BUSINESS_OPERATION_MAP.md`
- Core operations: `docs/CORE_OPERATIONS.md`
- Global contracts: `docs/errors/model.md`, `docs/errors/neverthrow-conventions.md`,
  `docs/architecture/async-lifecycle-and-acceptance.md`
- Local specs:
  - `docs/commands/deployments.retry.md`
  - `docs/commands/deployments.redeploy.md`
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

- Extend `Deployment` with explicit recovery metadata:
  - `triggerKind`: `create`, `retry`, `redeploy`, or `rollback`;
  - `sourceDeploymentId` for retry and optional redeploy audit context;
  - future `rollbackCandidateDeploymentId` remains reserved for rollback Code Round.
- Use value objects for recovery trigger/status/id concepts rather than primitive fields in
  aggregate state.
- Add aggregate factory/transition helpers so retry/redeploy attempts emit the existing deployment
  lifecycle events with safe recovery metadata.

### Application

- Add explicit command slices:
  - `RetryDeploymentCommand`, handler, schema, use case;
  - `RedeployDeploymentCommand`, handler, schema, use case.
- Add a deployment attempt runner/application service extracted from `CreateDeploymentUseCase` so
  create/redeploy share current-profile detect -> plan -> execute -> terminal persistence behavior.
- Add a retry attempt service that creates a new attempt from retained snapshot/runtime plan state
  and then uses the same execution/terminal persistence path.
- Re-evaluate `DeploymentRecoveryReadinessQueryService` policy server-side during admission; do not
  trust client readiness output.
- Add `mutationCoordinationPolicies.retryDeployment` and
  `mutationCoordinationPolicies.redeployDeployment` using `resource-runtime` scope.
- Keep handlers thin and constructor-injected through `tokens`.

### Persistence And Read Models

- Persist recovery trigger metadata in deployment storage and read models.
- Preserve existing deployment history; source attempts are not overwritten.
- Extend deployment detail summaries with recovery trigger/source metadata only when safe and needed
  by Web/CLI/API.
- No rollback artifact retention migration is required for retry/redeploy unless implementation
  reveals retry cannot prove retained runtime plan identity.

### Entrypoints

- Operation catalog and `CORE_OPERATIONS.md` must activate retry/redeploy in the same Code Round.
- CLI dispatches through command bus:
  - `appaloft deployments retry <deploymentId>`
  - `appaloft deployments redeploy <resourceId>`
- oRPC/HTTP routes reuse application schemas:
  - `POST /api/deployments/{deploymentId}/retries`
  - `POST /api/resources/{resourceId}/redeployments`
- Web recovery panel enables actions only from readiness output plus operation catalog active state.
- Public docs/help links reuse existing recovery anchors and must remove "not active yet" language
  for retry/redeploy when Code Round completes.

## Roadmap And Compatibility

- Roadmap target: Phase 7 / `0.9.0` beta.
- Version target: not releasing in this round.
- Compatibility impact: `pre-1.0-policy`, additive command surface and output metadata.
- Release-note/changelog: required during release prep after commands become active.

## Testing Strategy

Minimum Code Round coverage:

- Core:
  - `DEP-RETRY-001`: recovery trigger/source metadata on retry attempt state.
  - `DEP-REDEPLOY-001`: recovery trigger metadata on redeploy attempt state.
- Application:
  - `DEP-RETRY-001`: retry creates a new attempt from retained snapshot/runtime plan state.
  - `DEP-RETRY-002`: non-retryable attempt returns `deployment_not_retryable`.
  - `DEP-RETRY-003`: stale readiness marker returns `deployment_recovery_state_stale`.
  - `DEP-REDEPLOY-001`: redeploy creates a new attempt from current Resource profile.
  - `DEP-REDEPLOY-002`: redeploy ignores old snapshot as runtime truth.
  - `DEP-REDEPLOY-003`: invalid current profile returns `deployment_not_redeployable` or the
    owning deployment admission error.
- Persistence:
  - recovery trigger/source metadata round-trips in PG/PGlite.
- Entrypoints:
  - `DEP-RECOVERY-ENTRY-001`: operation catalog, CLI, and HTTP/oRPC dispatch explicit commands.
  - Web semantic/browser coverage for enabled retry/redeploy buttons when readiness and operation
    active state allow them.
- Regression:
  - rollback activation is owned by [Deployment Rollback](../041-deployment-rollback/spec.md);
    retry/redeploy behavior must continue to pass after rollback becomes active.

## Risks And Migration Gaps

- `deployments.create` is currently a large orchestration use case. Duplicating it would create
  behavioral drift; Code Round should extract shared orchestration carefully.
- Current deployment command success still waits for execution in parts of the implementation,
  while the async lifecycle contract defines acceptance-first semantics. Retry/redeploy should not
  worsen that gap; if acceptance-first is not fixed in this slice, record the migration gap instead
  of weakening specs.
- Runtime artifact retention is enough for retry only when the source deployment has retained
  runtime plan and environment snapshot. Rollback artifact retention remains separate.
- Public Web actions must be disabled unless readiness is allowed and command is active.

## Code Round Readiness

Retry/redeploy are ready for Code Round after this Spec Round because:

- ADR-016 and ADR-034 govern command boundaries and recovery semantics;
- local command specs exist;
- stable error codes and reason codes exist;
- recovery readiness query is active and tested;
- this artifact records implementation placement, entrypoints, tests, and migration gaps.
