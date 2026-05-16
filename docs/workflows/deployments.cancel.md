# deployments.cancel Workflow

## Status

Active pre-`1.0.0-rc` hardening workflow for explicitly canceling an active deployment attempt.

## Governing Sources

- [deployments.cancel Command Spec](../commands/deployments.cancel.md)
- [deployments.cancel Error Spec](../errors/deployments.cancel.md)
- [deployments.cancel Test Matrix](../testing/deployments.cancel-test-matrix.md)
- [ADR-016: Deployment Command Surface Reset](../decisions/ADR-016-deployment-command-surface-reset.md)
- [ADR-027: Deployment Supersede And Execution Fencing](../decisions/ADR-027-deployment-supersede-and-execution-fencing.md)
- [ADR-028: Command Coordination Scope And Mutation Admission](../decisions/ADR-028-command-coordination-scope-and-mutation-admission.md)

## Workflow

1. Caller requests `deployments.cancel` with `deploymentId`, exact `confirm`, and optional
   `resourceId`.
2. Application validates confirmation before loading or mutating runtime state.
3. Application loads the deployment attempt and rejects missing or resource-mismatched requests.
4. Application coordinates on the attempt's `resource-runtime` scope.
5. Application re-loads the attempt inside coordination and rejects terminal attempts.
6. For a running attempt, application records `cancel-requested`, persists it, publishes
   `deployment.cancel_requested`, and asks the runtime backend to cancel.
7. Application records canceled terminal state, appends safe runtime cancel logs when present,
   persists, and publishes `deployment.canceled` plus `deployment.finished`.
8. Caller observes the terminal attempt through deployment detail, logs, and event stream surfaces.

## Boundary Rules

- Cancel does not delete deployment history, runtime artifacts, logs, routes, events, audit rows,
  provider job logs, process attempts, resources, environments, or projects.
- Cancel does not create rollback attempts, retry attempts, redeploy attempts, or preview cleanup
  work.
- Supersede remains an internal `deployments.create` branch; public cancel uses the same domain
  state-machine helpers but has its own admission, command schema, tests, and public operation key.

## Public Surfaces

- CLI: `appaloft deployments cancel <deploymentId> --confirm <deploymentId>`
- HTTP/oRPC: `POST /api/deployments/{deploymentId}/cancel`
- Public docs/help: `deployment.recovery-readiness`
- Future MCP/tool surface: explicit active-attempt cancel with exact id confirmation.
