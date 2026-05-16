# deployments.archive Command Spec

## Purpose

`deployments.archive` hides one terminal deployment attempt from default deployment history without
deleting the attempt row, logs, events, runtime artifacts, provider job logs, audit rows, route
state, rollback candidates, or operator-work evidence.

## Command

- Operation key: `deployments.archive`
- Message: `ArchiveDeploymentCommand`
- CLI: `appaloft deployments archive <deploymentId> --confirm <deploymentId>`
- HTTP/oRPC: `POST /api/deployments/{deploymentId}/archive`
- Public docs anchor: `deployment.recovery-readiness`

## Input

| Field | Required | Meaning |
| --- | --- | --- |
| `deploymentId` | Yes | Deployment attempt id to archive. |
| `confirm` | Yes | Must exactly match `deploymentId`. |
| `resourceId` | No | Optional Resource scope guard. |

## Rules

- The command may archive only terminal attempts: `succeeded`, `failed`, `canceled`, or
  `rolled-back`.
- Active attempts return `deployment_archive_not_allowed` and are not mutated.
- Archive is idempotent for an already archived terminal attempt.
- Default `deployments.list` hides archived attempts; `includeArchived = true` includes them.
- `deployments.show` may still read an archived attempt by id.

## Events

The command publishes `deployment.archived` after persistence succeeds.

## Matrix

- `DEP-ARCHIVE-001`
- `DEP-ARCHIVE-002`
- `DEP-ARCHIVE-ENTRY-001`
- `DEP-ARCHIVE-ENTRY-002`
- `DEP-ARCHIVE-ENTRY-003`
