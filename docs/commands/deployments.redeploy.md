# deployments.redeploy Command Spec

## Status

Accepted candidate. The Code Round is scoped by
[Deployment Retry And Redeploy](../specs/040-deployment-retry-redeploy/spec.md). Do not expose this
command until `deployments.recovery-readiness`, this command spec, the error spec, test matrix,
implementation plan, public docs/help, `CORE_OPERATIONS.md`, and `operation-catalog.ts` are aligned
in that Code Round.

## Governing Sources

- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-014: Deployment Admission Uses Resource Profile](../decisions/ADR-014-deployment-admission-uses-resource-profile.md)
- [ADR-016: Deployment Command Surface Reset](../decisions/ADR-016-deployment-command-surface-reset.md)
- [ADR-034: Deployment Recovery Readiness](../decisions/ADR-034-deployment-recovery-readiness.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)
- [Deployment Recovery Readiness Spec](../specs/012-deployment-recovery-readiness/spec.md)
- [Deployment Retry And Redeploy](../specs/040-deployment-retry-redeploy/spec.md)
- [deployments.create Command Spec](./deployments.create.md)
- [deployments.recovery-readiness Query Spec](../queries/deployments.recovery-readiness.md)
- [Deployment Recovery Readiness Error Spec](../errors/deployment-recovery-readiness.md)
- [Deployment Recovery Readiness Test Matrix](../testing/deployment-recovery-readiness-test-matrix.md)

## Intent

`deployments.redeploy` requests a new deployment attempt from the current Resource profile,
effective configuration, runtime target, and destination at admission time.

It does not:

- reuse an old deployment snapshot;
- retry a failed phase;
- restore a historical artifact;
- bypass Resource profile validation.

## Input

```ts
type RedeployDeploymentInput = {
  resourceId: string;
  environmentId?: string;
  projectId?: string;
  sourceDeploymentId?: string;
  readinessGeneratedAt?: string;
};
```

`sourceDeploymentId` is optional context for UX and auditability. It does not become the source of
runtime truth.

## Admission

- Resolve the current Resource profile and effective environment context exactly as
  `deployments.create` does for current desired state.
- Re-evaluate redeploy readiness server-side when `sourceDeploymentId` is supplied.
- Reject invalid or incomplete current profile state with `deployment_not_redeployable` or the
  existing profile/admission error code that owns the failing branch.
- Coordinate on `resource-runtime` so redeploy cannot race with create/retry/rollback.

## Accepted Result

The command returns accepted async work with a new deployment attempt id. Completion or failure is
observed through `deployments.show`, `deployments.stream-events`, logs, and future readiness reads.

## Events

The new attempt emits the normal deployment lifecycle events and may include:

- `triggerKind: "redeploy"`;
- `sourceDeploymentId` when the user initiated redeploy from an existing deployment detail.
