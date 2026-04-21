# ADR-027: Deployment Supersede And Execution Fencing

## Status

Accepted

## Decision

`deployments.create` remains the only public deployment-attempt admission command, but a later
same-resource deployment request may supersede one previous active attempt instead of blindly
rejecting every later request.

This does not reintroduce a public `deployments.cancel` command. Supersede is an internal workflow
branch owned by `deployments.create`.

The governing rule is:

- at most one same-resource active deployment attempt may exist durably at a time;
- when a later request takes ownership, the previous active attempt records
  `supersededByDeploymentId`;
- running attempts enter `cancel-requested`, are canceled through the runtime backend, and then are
  marked `canceled`;
- non-running active attempts may be canceled immediately;
- stale writes from a superseded attempt must be fenced so they cannot overwrite newer deployment
  state.

## Consequences

- `deployments.create` may replace a previous `created`, `planning`, `planned`, or `running`
  attempt for the same resource.
- supersede failure is an explicit `deployments.create` error branch, not a silent best-effort
  cleanup.
- public cancel, redeploy, and rollback commands remain outside the v1 surface under ADR-016.

## Governed Specs

- [deployments.create Command Spec](../commands/deployments.create.md)
- [deployments.create Workflow Spec](../workflows/deployments.create.md)
- [deployments.create Error Spec](../errors/deployments.create.md)
- [deployments.create Test Matrix](../testing/deployments.create-test-matrix.md)
- [ADR-016: Deployment Command Surface Reset](./ADR-016-deployment-command-surface-reset.md)
- [ADR-021: Docker/OCI Workload Substrate](./ADR-021-docker-oci-workload-substrate.md)
- [ADR-023: Runtime Orchestration Target Boundary](./ADR-023-runtime-orchestration-target-boundary.md)
