# deployments.recovery-readiness Query Spec

## Status

Accepted candidate. This query is specified for the Deployment Recovery Readiness Spec Round and
must not be exposed as an active public operation until the Code Round updates
`docs/CORE_OPERATIONS.md`, `packages/application/src/operation-catalog.ts`, executable tests, and
Web/API/CLI/future MCP entrypoints together.

## Governing Sources

- [ADR-016: Deployment Command Surface Reset](../decisions/ADR-016-deployment-command-surface-reset.md)
- [ADR-029: Deployment Event Stream And Recovery Boundary](../decisions/ADR-029-deployment-event-stream-and-recovery-boundary.md)
- [ADR-034: Deployment Recovery Readiness](../decisions/ADR-034-deployment-recovery-readiness.md)
- [Deployment Recovery Readiness Spec](../specs/012-deployment-recovery-readiness/spec.md)
- [Deployment Recovery Readiness Plan](../specs/012-deployment-recovery-readiness/plan.md)
- [Deployment Recovery Readiness Error Spec](../errors/deployment-recovery-readiness.md)
- [Deployment Recovery Readiness Test Matrix](../testing/deployment-recovery-readiness-test-matrix.md)
- [deployments.show Query Spec](./deployments.show.md)
- [deployments.stream-events Query Spec](./deployments.stream-events.md)

## Intent

`deployments.recovery-readiness` is the shared read-side decision for whether a deployment can be
retried, redeployed, or rolled back. Web, CLI, HTTP/oRPC, and future MCP/tool surfaces must use this
query rather than recomputing recovery rules locally.

It is a query only. It does not enqueue runtime work, mutate deployment state, reserve a rollback
candidate, or mark an old deployment as superseded.

## Input

```ts
type DeploymentRecoveryReadinessInput = {
  deploymentId: string;
  resourceId?: string;
  includeCandidates?: boolean;
  maxCandidates?: number;
};
```

Rules:

- `deploymentId` identifies the deployment attempt being inspected.
- `resourceId` may be supplied for routing or ambiguity checks, but the deployment attempt remains
  the primary lookup key.
- `includeCandidates` defaults to `true` for interactive surfaces and `false` for compact status
  checks.
- `maxCandidates` limits returned rollback candidates and must not change the computed
  `rollbackCandidateCount`.

## Output

The normative output shape is defined in
[Deployment Recovery Readiness Spec](../specs/012-deployment-recovery-readiness/spec.md). At minimum,
the read model must report:

- deployment/resource identity and current lifecycle status;
- `recoverable`, `retry`, `redeploy`, and `rollback` readiness summaries;
- retained rollback candidates, when requested;
- stable blocked reason codes and suggested safe next actions;
- `generatedAt` and a state/version marker suitable for stale admission checks by future recovery
  commands.

## Readiness Rules

- Retry is ready only for a failed, interrupted, canceled, or superseded attempt whose immutable
  snapshot intent and required runtime inputs are retained.
- Redeploy is ready when the current Resource profile can admit a fresh deployment attempt for the
  target/destination, regardless of whether the inspected attempt's old snapshot is usable.
- Rollback is ready when at least one successful prior candidate retains the immutable deployment
  snapshot, environment snapshot, runtime target/destination identity, and Docker/OCI artifact
  identity needed to create a rollback attempt.
- Stream reconnect gaps never make recovery ready or blocked by themselves. Gaps only mean the
  observer should re-read durable state through this query or `deployments.show`.

## Blocked Reason Codes

Initial stable reason-code vocabulary:

- `attempt-not-terminal`
- `attempt-status-not-recoverable`
- `snapshot-missing`
- `environment-snapshot-missing`
- `runtime-target-missing`
- `runtime-artifact-missing`
- `rollback-candidate-not-successful`
- `rollback-candidate-expired`
- `rollback-candidate-target-mismatch`
- `resource-profile-invalid`
- `resource-runtime-busy`
- `stateful-data-rollback-unsupported`
- `recovery-command-not-active`

Reason codes are part of the user/tool contract and must be covered by the test matrix before Code
Round activation.

## Current Implementation Notes And Migration Gaps

No active implementation exists yet. `deployments.show` and `deployments.stream-events` remain the
active observation boundaries. This query is Code Round ready only after test fixtures define the
durable state combinations for retry, redeploy, rollback candidates, blocked reasons, and stale
admission guards.
