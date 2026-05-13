# Provider Job Log Retention

## Status

- Round: Code Round plus Post-Implementation Sync
- Artifact state: implemented

## Business Outcome

Operators can preview and prune old retained provider job log rows with an explicit cutoff, reducing
stale delete blockers and bounded storage growth without mutating deployment state, deployment logs,
runtime logs, event streams, process state, or business aggregates.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Provider job log | A retained provider diagnostic row for provider/runtime job execution, stored separately from Deployment logs. | Operator retention | provider log |
| Provider job log retention | The policy that keeps provider job log rows visible to delete-safety checks until explicitly pruned. | Operator maintenance | provider log retention |
| Provider job log prune | A dry-run-first command that deletes only old provider job log rows selected by cutoff and optional safe scope. | Operator maintenance | provider log cleanup |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| PROV-JOB-LOG-PRUNE-001 | Dry-run by default | provider job log rows exist older than `before` | `provider-job-logs.prune` omits `dryRun` | matching counts are returned and no row is deleted. |
| PROV-JOB-LOG-PRUNE-002 | Destructive prune | provider job log rows are older than `before` | `dryRun` is `false` | only matching provider job log rows are deleted and counts by provider key are returned. |
| PROV-JOB-LOG-PRUNE-003 | Cutoff and scope safety | rows are newer, cutoff-equal, or outside deployment/provider/resource/server scope | prune runs | those rows remain retained. |
| PROV-JOB-LOG-PRUNE-004 | Entrypoints dispatch shared command | CLI or HTTP/oRPC invokes prune | inputs are parsed | adapters dispatch `PruneProviderJobLogsCommand` through `CommandBus`. |

## Domain Ownership

- Bounded context: Operator retention / provider diagnostics.
- Aggregate/resource owner: none; provider job logs are retained diagnostic rows scoped through
  Deployment when `resourceId` or `serverId` filters are supplied.
- Upstream/downstream contexts: delete safety readers observe retained provider job log rows as
  blockers for Resources and DeploymentTargets.

## Public Surfaces

- API: `POST /api/provider-job-logs/prune`.
- CLI: `appaloft provider-job-log prune --before <iso> [--deployment <deploymentId>] [--provider <providerKey>] [--resource <resourceId>] [--server <serverId>] [--dry-run false]`.
- Web/UI: future operator maintenance panel may call the same command after showing a dry-run
  preview.
- Config: none in this slice.
- Events: none in this slice.
- Public docs/help: `operator.provider-job-logs`.

## Non-Goals

- Deployment log retention for logs embedded in Deployment state.
- Resource runtime log archival or retention.
- Domain event stream retention.
- Outbox/inbox retention, retry, or dead-letter behavior.
- Audit rows, process-attempt journal rows, remote-state backups, runtime artifacts, source
  workspaces, build cache, or deployment snapshot retention.
- Provider job log export, legal holds, organization retention defaults, or immutable archive
  export.

## Current Implementation Notes And Migration Gaps

- Provider job log prune remains dry-run-first and requires an explicit `before` cutoff.
  Destructive prune without a deployment/provider/resource/server scope does not require a separate
  confirmation token in this slice.
- Provider job log writers and readback/export surfaces remain outside this retention command.
- Organization retention defaults and scheduled history retention can govern provider job log prune
  scheduling through their own ADR/spec slices; Web maintenance affordances remain future.
