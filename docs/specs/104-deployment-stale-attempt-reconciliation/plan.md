# Plan: Deployment Stale Attempt Reconciliation

## Governing Sources

- [ADR-088](../../decisions/ADR-088-deployment-stale-attempt-reconciliation.md)
- [Async Lifecycle And Acceptance](../../architecture/async-lifecycle-and-acceptance.md)
- [Deployment Recovery Readiness](../012-deployment-recovery-readiness/spec.md)
- [Deployment Stale Attempt Test Matrix](../../testing/deployment-stale-attempt-test-matrix.md)

## Architecture Approach

- Add `interrupted` to `DeploymentStatusValue` and an aggregate transition that records terminal
  events while preserving history.
- Share a pure application stale-observation policy between query and command admission.
- Use the bounded `DeploymentReadModel` for the query and `DeploymentRepository` plus
  `MutationCoordinator` for the command.
- Reuse `ExecutionBackend.cancel` only for runtime-owning states.
- Add operation-catalog, CLI, oRPC/OpenAPI/SDK and public help surfaces over shared schemas.
- Persist the additive status through existing text status columns and aligned schema validation.

## Testing Strategy

- Matrix ids: `DEP-STALE-001` through `DEP-STALE-008`.
- Unit: status transition, stale policy, state-version changes.
- Application: bounded query and coordinated command branches.
- Persistence: interrupted round trip and active uniqueness release.
- Contract: operation catalog, oRPC, CLI, generated SDK/OpenAPI.

## Risks And Migration Gaps

- A runtime that produces no persisted progress can look stale during legitimate long work. The
  default threshold is conservative and reconciliation stays explicit.
- Automatic periodic reconciliation is deferred and must call the same public contract.
