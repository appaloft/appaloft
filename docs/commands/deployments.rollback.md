# deployments.rollback Command Spec

## Status

Active command. The Code Round is scoped by
[Deployment Rollback](../specs/041-deployment-rollback/spec.md). It is exposed only through aligned
readiness, error, test matrix, implementation plan, public docs/help, `CORE_OPERATIONS.md`, and
`operation-catalog.ts` surfaces.

## Governing Sources

- [ADR-016: Deployment Command Surface Reset](../decisions/ADR-016-deployment-command-surface-reset.md)
- [ADR-021: Docker/OCI Workload Substrate](../decisions/ADR-021-docker-oci-workload-substrate.md)
- [ADR-023: Runtime Orchestration Target Boundary](../decisions/ADR-023-runtime-orchestration-target-boundary.md)
- [ADR-034: Deployment Recovery Readiness](../decisions/ADR-034-deployment-recovery-readiness.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)
- [Deployment Recovery Readiness Spec](../specs/012-deployment-recovery-readiness/spec.md)
- [Deployment Rollback](../specs/041-deployment-rollback/spec.md)
- [Deployment Observation And Recovery Hardening](../specs/071-deployment-observation-and-recovery/spec.md)
- [Durable Process Delivery Baseline](../specs/060-durable-process-delivery-baseline/spec.md)
- [deployments.recovery-readiness Query Spec](../queries/deployments.recovery-readiness.md)
- [Deployment Recovery Readiness Error Spec](../errors/deployment-recovery-readiness.md)
- [Deployment Recovery Readiness Test Matrix](../testing/deployment-recovery-readiness-test-matrix.md)
- [Durable Process Delivery Test Matrix](../testing/durable-process-delivery-test-matrix.md)

## Intent

`deployments.rollback` requests a new rollback deployment attempt from a retained successful
candidate's immutable deployment snapshot and Docker/OCI artifact identity.

It does not:

- re-plan from the current Resource profile;
- rebuild from source unless a later ADR explicitly adds a separate recovery mode;
- roll back databases, volumes, queues, or external dependencies;
- mutate the historical successful deployment record.

## Input

```ts
type RollbackDeploymentInput = {
  deploymentId: string;
  rollbackCandidateDeploymentId: string;
  resourceId?: string;
  readinessGeneratedAt?: string;
};
```

`deploymentId` is the deployment being recovered from. `rollbackCandidateDeploymentId` is the retained
successful deployment selected by the user/tool.

## Admission

- Verify both deployments exist, belong to the same resource and compatible runtime target, and are
  visible to the actor.
- Re-evaluate rollback readiness server-side; do not trust client-provided candidate data.
- Reject missing/expired candidates with `deployment_rollback_candidate_not_found`.
- Reject missing snapshot, environment snapshot, target/destination identity, or artifact identity
  with `deployment_not_rollback_ready`.
- Reject stale readiness with `deployment_recovery_state_stale` when the supplied readiness marker no
  longer matches durable state.
- Coordinate on `resource-runtime` so rollback cannot race with create/retry/redeploy.

## Accepted Result

The command returns accepted async work with a new rollback attempt id. Running, completion, and
failure outcomes are also mirrored into the durable process attempt journal for `operator-work.*`
visibility with safe Deployment, Resource, server, runtime plan, target backend, source deployment
lineage, and rollback candidate lineage metadata.

Rollback execution still runs inline through the rollback use case after admission/start state is
persisted. It is not claimed or completed by a process-attempt worker yet. Completion or failure is
observed through `deployments.show`, `deployments.timeline`, operator work, and future
readiness reads.

## Events

The new attempt emits the normal deployment lifecycle events and may include:

- `triggerKind: "rollback"`;
- `sourceDeploymentId` referencing the deployment being recovered from;
- `rollbackCandidateDeploymentId` referencing the retained successful deployment used as runtime
  input.
