# deployments.cancel Command Spec

## Status

Active pre-`1.0.0-rc` hardening command. This command reintroduces public deployment cancel after
ADR-016 removed the old ungoverned surface. The rebuilt boundary is limited to active deployment
attempts and is proven by `DEP-CANCEL-*` executable tests.

## Governing Sources

- [ADR-016: Deployment Command Surface Reset](../decisions/ADR-016-deployment-command-surface-reset.md)
- [ADR-027: Deployment Supersede And Execution Fencing](../decisions/ADR-027-deployment-supersede-and-execution-fencing.md)
- [ADR-028: Command Coordination Scope And Mutation Admission](../decisions/ADR-028-command-coordination-scope-and-mutation-admission.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)
- [Deployment Recovery Readiness Spec](../specs/012-deployment-recovery-readiness/spec.md)
- [Deployment Cancel Test Matrix](../testing/deployments.cancel-test-matrix.md)
- [deployments.cancel Error Spec](../errors/deployments.cancel.md)

## Intent

`deployments.cancel` requests cancellation of one active deployment attempt. It is not a delete,
archive, rollback, retry, redeploy, preview cleanup, or manual health check. Terminal deployment
attempts are immutable history and cannot be canceled.

## Input

```ts
type CancelDeploymentInput = {
  deploymentId: string;
  confirm: string;
  resourceId?: string;
};
```

`confirm` must exactly match `deploymentId`. This keeps accidental active-runtime cancellation from
being a single mistyped id or copied link action.

## Admission

- Load the deployment attempt by `deploymentId`.
- If `resourceId` is supplied, reject attempts that belong to another Resource.
- Reject terminal attempts with `deployment_cancel_not_allowed`.
- Coordinate on the same `resource-runtime` scope as create/retry/redeploy/rollback so cancel cannot
  race with another runtime owner.
- Re-read the deployment inside the coordination scope before mutating state.

## State Transition

- `running` attempts first record `deployment.cancel_requested`, persist `cancel-requested`, publish
  the request event, ask the execution backend to cancel the runtime, then record canceled terminal
  state.
- `created`, `planning`, and `planned` attempts are canceled without a backend runtime cancel call.
- Canceled attempts record `deployment.canceled` and `deployment.finished` with terminal status
  `canceled`.

## Accepted Result

```ts
type CancelDeploymentResult = {
  id: string;
  status: "canceled";
  canceledAt: string;
};
```

The canceled attempt remains visible through `deployments.show`, `deployments.list`,
`deployments.logs`, and `deployments.stream-events`.

## Entrypoints

- CLI: `appaloft deployments cancel <deploymentId> --confirm <deploymentId>`
- HTTP/oRPC: `POST /api/deployments/{deploymentId}/cancel`
- Web: the public operation is cataloged for the deployment recovery surface; browser-flow coverage
  for an interactive cancel button remains a quality follow-up unless a Web page already offers the
  action through the shared client contract.
- Future MCP/tool surface: describe this as an explicit active-attempt cancellation with exact id
  confirmation and no delete/rollback semantics.
