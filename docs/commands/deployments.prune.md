# deployments.prune Command Spec

## Purpose

`deployments.prune` is a dry-run-first retention command for archived deployment attempts. It
removes only archived terminal attempt rows that are older than the cutoff and have no retained
references that would make deletion unsafe.

## Command

- Operation key: `deployments.prune`
- Message: `PruneDeploymentsCommand`
- CLI: `appaloft deployments prune --before <iso>`
- HTTP/oRPC: `POST /api/deployments/prune`
- Public docs anchor: `deployment.recovery-readiness`

## Input

| Field | Required | Default | Meaning |
| --- | --- | --- | --- |
| `before` | Yes | n/a | ISO cutoff. Only attempts archived before this instant are eligible. |
| `deploymentId` | No | n/a | Optional exact deployment id filter. |
| `resourceId` | No | n/a | Optional Resource filter. |
| `serverId` | No | n/a | Optional DeploymentTarget/server filter. |
| `dryRun` | No | `true` | When true, reports eligible/guarded rows and deletes nothing. |

## Rules

- The command considers only archived terminal attempts.
- Destructive prune requires `dryRun = false`.
- Attempts referenced by source/retry/rollback/supersede lineage, provider job logs, resource
  runtime log archives, or runtime-control attempts are guarded and are not deleted.
- Prune does not delete provider job logs, runtime log archives, audit rows, domain event stream
  rows, process attempts, runtime artifacts, routes, resources, servers, or environment snapshots
  outside the pruned deployment row.

## Matrix

- `DEP-PRUNE-001`
- `DEP-PRUNE-002`
- `DEP-PRUNE-ENTRY-001`
- `DEP-PRUNE-ENTRY-002`
- `DEP-PRUNE-ENTRY-003`
