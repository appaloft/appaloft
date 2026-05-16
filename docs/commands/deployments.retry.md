# deployments.retry Command Spec

## Status

Active command. The Code Round was scoped by
[Deployment Retry And Redeploy](../specs/040-deployment-retry-redeploy/spec.md). It is exposed only
through aligned readiness, error, test matrix, implementation plan, public docs/help,
`CORE_OPERATIONS.md`, and `operation-catalog.ts` surfaces. Remaining work is edge-case hardening
tracked by
[Deployment Observation And Recovery Hardening](../specs/071-deployment-observation-and-recovery/spec.md).

## Governing Sources

- [ADR-016: Deployment Command Surface Reset](../decisions/ADR-016-deployment-command-surface-reset.md)
- [ADR-034: Deployment Recovery Readiness](../decisions/ADR-034-deployment-recovery-readiness.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)
- [Deployment Recovery Readiness Spec](../specs/012-deployment-recovery-readiness/spec.md)
- [Deployment Retry And Redeploy](../specs/040-deployment-retry-redeploy/spec.md)
- [Deployment Observation And Recovery Hardening](../specs/071-deployment-observation-and-recovery/spec.md)
- [deployments.recovery-readiness Query Spec](../queries/deployments.recovery-readiness.md)
- [Deployment Recovery Readiness Error Spec](../errors/deployment-recovery-readiness.md)
- [Deployment Recovery Readiness Test Matrix](../testing/deployment-recovery-readiness-test-matrix.md)

## Intent

`deployments.retry` requests a new deployment attempt from a failed, interrupted, canceled, or
superseded attempt's retained immutable snapshot intent.

It does not:

- rerun a failed phase inside the old attempt;
- replay old deployment lifecycle events;
- use the current Resource profile as the source of truth;
- imply rollback.

## Input

```ts
type RetryDeploymentInput = {
  deploymentId: string;
  resourceId?: string;
  readinessGeneratedAt?: string;
};
```

`readinessGeneratedAt` is optional for non-interactive clients, but interactive surfaces should pass
the value returned by `deployments.recovery-readiness` so the command can reject stale decisions with
`deployment_recovery_state_stale`.

## Admission

- Verify the source deployment exists and belongs to the requested resource when `resourceId` is
  supplied.
- Re-evaluate retry readiness server-side; do not trust a client-provided readiness summary.
- Reject non-terminal or not-recoverable statuses with `deployment_not_retryable`.
- Reject missing snapshot/runtime inputs with `deployment_not_retryable`.
- Coordinate on `resource-runtime` so retry cannot race with create/redeploy/rollback.

## Accepted Result

The command returns accepted async work with a new deployment attempt id. Completion or failure is
observed through `deployments.show`, `deployments.stream-events`, logs, and future readiness reads.

Accepted retry execution is also mirrored into the durable process attempt journal for
`operator-work.*` visibility with Deployment, Resource, server, runtime plan, target backend, and
source deployment lineage metadata. The retry use case still executes inline after admission/start
state is persisted; process-attempt atomic claim/completion is a future deployment-worker concern.

## Events

The new attempt emits the normal deployment lifecycle events and may include:

- `triggerKind: "retry"`;
- `sourceDeploymentId` referencing the source failed/interrupted/canceled/superseded attempt.
