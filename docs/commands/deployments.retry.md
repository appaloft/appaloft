# deployments.retry Command Spec

## Status

Accepted candidate. Do not expose this command until `deployments.recovery-readiness`, this command
spec, the error spec, test matrix, implementation plan, public docs/help, `CORE_OPERATIONS.md`, and
`operation-catalog.ts` are aligned in a Code Round.

## Governing Sources

- [ADR-016: Deployment Command Surface Reset](../decisions/ADR-016-deployment-command-surface-reset.md)
- [ADR-034: Deployment Recovery Readiness](../decisions/ADR-034-deployment-recovery-readiness.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)
- [Deployment Recovery Readiness Spec](../specs/012-deployment-recovery-readiness/spec.md)
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

## Events

The new attempt emits the normal deployment lifecycle events and may include:

- `triggerKind: "retry"`;
- `sourceDeploymentId` referencing the source failed/interrupted/canceled/superseded attempt.
