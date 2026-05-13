# deployments.logs.prune Command Spec

## Metadata

- Operation key: `deployments.logs.prune`
- Command class: `PruneDeploymentLogsCommand`
- Input schema: `PruneDeploymentLogsCommandInput`
- Handler: `PruneDeploymentLogsCommandHandler`
- Use case: `PruneDeploymentLogsUseCase`
- Domain / bounded context: Deployment log retention
- Current status: active command

## Normative Contract

`deployments.logs.prune` previews or deletes old embedded deployment log entries from Deployment
rows.

Command success means Appaloft counted matching deployment log entries and, when `dryRun` is
`false`, removed only matching entries from `deployments.logs`. It does not delete deployment rows,
change deployment status, rewrite runtime plans, mutate environment snapshots, change rollback
metadata, delete deployment history, mutate resource runtime logs, provider job logs, audit rows,
domain event streams, outbox/inbox records, process-attempt journals, remote-state backups,
runtime artifacts, source workspaces, build cache, resources, servers, routes, dependency data,
storage volumes, provider resources, or compatibility ledger rows.

## Input Model

| Field | Requirement | Meaning |
| --- | --- | --- |
| `before` | Required | ISO timestamp cutoff. Only log entries with `timestamp < before` are eligible. |
| `deploymentId` | Optional | Narrows prune to one deployment id. |
| `resourceId` | Optional | Narrows prune to deployments for one resource. |
| `serverId` | Optional | Narrows prune to deployments for one deployment target/server. |
| `dryRun` | Optional | Defaults to `true`. When true, returns counts without deleting log entries. |

## Admission Flow

The command must:

1. Validate command input.
2. Normalize omitted `dryRun` to `true`.
3. Count embedded deployment log entries older than `before`, optionally filtered by deployment,
   resource, and server.
4. Return the number of matching log entries and affected deployments.
5. If `dryRun` is `false`, write back each affected deployment's `logs` value without the matched
   entries.

## Rules

- Dry-run must not mutate persistence.
- Destructive prune requires explicit `dryRun = false`.
- Matching uses `timestamp < before`; cutoff-equal rows are retained.
- A deployment row is never deleted by this command.
- Entries outside deployment/resource/server filters are retained.
- No deployment log message text is returned by the prune response.
- Deployment read models may show fewer logs after destructive prune.

## Entrypoints

| Entrypoint | Contract |
| --- | --- |
| CLI | `appaloft deployments logs prune --before <iso> [--deployment <deploymentId>] [--resource <resourceId>] [--server <serverId>] [--dry-run false]` dispatches this command. |
| API/oRPC | `POST /api/deployments/logs/prune` uses the same command schema. |
| Web | Future operator maintenance UI may call the same command after showing a dry-run preview. |

## Error Contract

| Code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `command-validation` | No | Input is missing or malformed. |
| `infra_error` | `deployment-log-retention` | Conditional | The count or writeback operation could not be completed. |

## Tests

The governing matrix is
[Deployment Log Retention Test Matrix](../testing/deployment-log-retention-test-matrix.md). At
minimum, Code Round coverage must prove:

- dry-run returns eligible counts without mutating deployment logs;
- destructive prune removes only old matching embedded log entries;
- cutoff-equal, newer, and out-of-scope deployment/resource/server entries are retained;
- deployment rows and deployment metadata remain intact;
- CLI and HTTP/oRPC dispatch use the shared command schema.

## Current Implementation Notes And Migration Gaps

This command covers only embedded Deployment log entries. Resource runtime log archival, provider
job log retention, audit retention, domain event stream retention, outbox/inbox retention,
scheduled retention automation, legal holds, organization retention defaults, and immutable archive
export remain separate governed slices.
