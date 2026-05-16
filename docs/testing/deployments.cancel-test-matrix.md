# deployments.cancel Test Matrix

## Status

Active pre-`1.0.0-rc` hardening matrix. These rows are the executable evidence required to close
the public cancel portion of deployment lifecycle unevenness.

## Governing Sources

- [ADR-016: Deployment Command Surface Reset](../decisions/ADR-016-deployment-command-surface-reset.md)
- [ADR-027: Deployment Supersede And Execution Fencing](../decisions/ADR-027-deployment-supersede-and-execution-fencing.md)
- [ADR-028: Command Coordination Scope And Mutation Admission](../decisions/ADR-028-command-coordination-scope-and-mutation-admission.md)
- [deployments.cancel Command Spec](../commands/deployments.cancel.md)
- [deployments.cancel Error Spec](../errors/deployments.cancel.md)
- [Deployment Recovery Readiness Test Matrix](./deployment-recovery-readiness-test-matrix.md)

## Command Coverage

| ID | Scenario | Expected assertion | Automation binding | Status |
| --- | --- | --- | --- | --- |
| `DEP-CANCEL-001` | Running deployment is canceled. | Command records cancel-requested, calls runtime backend cancel, records canceled terminal state, persists runtime cancel logs, and publishes `deployment.cancel_requested`, `deployment.canceled`, and `deployment.finished`. | `packages/application/test/cancel-deployment.test.ts` | Passing |
| `DEP-CANCEL-002` | Planned deployment is canceled before runtime execution starts. | Command records canceled terminal state without calling runtime backend cancel. | `packages/application/test/cancel-deployment.test.ts` | Passing |
| `DEP-CANCEL-003` | Terminal deployment is canceled. | Command rejects with `deployment_cancel_not_allowed` and does not mutate the attempt. | `packages/application/test/cancel-deployment.test.ts` | Passing |
| `DEP-CANCEL-004` | Confirmation id does not match deployment id. | Command rejects with `validation_error` before runtime mutation or backend cancel. | `packages/application/test/cancel-deployment.test.ts` | Passing |

## Entrypoint Coverage

| ID | Scenario | Expected assertion | Automation binding | Status |
| --- | --- | --- | --- | --- |
| `DEP-CANCEL-ENTRY-001` | CLI cancel is invoked. | CLI dispatches `CancelDeploymentCommand` through the shared CommandBus with deployment id, confirmation id, and optional resource id. | `packages/adapters/cli/test/deployment-cancel-command.test.ts` | Passing |
| `DEP-CANCEL-ENTRY-002` | HTTP/oRPC cancel route is invoked. | `POST /api/deployments/{deploymentId}/cancel` dispatches `CancelDeploymentCommand` and returns the shared cancel response schema. | `packages/orpc/test/deployment-create.http.test.ts` | Passing |
| `DEP-CANCEL-ENTRY-003` | Operation catalog, SDK/OpenAPI metadata, public docs registry, and CLI/help surfaces include cancel. | `deployments.cancel` has shared schema, CLI and HTTP/oRPC transports, generated SDK operation metadata, docs-registry topic coverage, and help anchors. | `packages/application/test/operation-catalog-boundary.test.ts`; `packages/docs-registry/test/operation-coverage.test.ts`; `packages/sdk/test/generated-operations.test.ts`; `packages/openapi/test/openapi-reference.test.ts` | Pending current round verification |

## Current Implementation Notes And Migration Gaps

The public operation is active for CLI and HTTP/oRPC. Web has a documented public recovery/help
surface and typed client contract; an interactive browser-flow cancel button is not required for the
operation to exist but remains an eligible quality follow-up if product design wants the Web console
to offer active attempt cancellation inline.
