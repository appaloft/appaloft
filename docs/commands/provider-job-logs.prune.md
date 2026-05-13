# provider-job-logs.prune Command Spec

## Metadata

- Operation key: `provider-job-logs.prune`
- Command class: `PruneProviderJobLogsCommand`
- Input schema: `PruneProviderJobLogsCommandInput`
- Handler: `PruneProviderJobLogsCommandHandler`
- Use case: `PruneProviderJobLogsUseCase`
- Domain / bounded context: Operator retention / provider diagnostics
- Current status: active command

## Normative Contract

`provider-job-logs.prune` previews or deletes retained provider job log rows from
`provider_job_logs`.

Command success means Appaloft counted matching provider job log rows and, when `dryRun` is
`false`, deleted only matching provider job log rows. It does not mutate deployment rows, embedded
deployment logs, resource runtime logs, domain event streams, outbox/inbox records, process-attempt
journals, runtime logs, audit rows, deployment snapshots, remote-state backups, runtime artifacts,
resource/server/deployment state, routes, dependency data, storage volumes, provider resources, or
compatibility ledger rows.

## Input Model

| Field | Requirement | Meaning |
| --- | --- | --- |
| `before` | Required | ISO timestamp cutoff. Only rows with `createdAt < before` are eligible. |
| `deploymentId` | Optional | Narrows prune to one deployment id. |
| `providerKey` | Optional | Narrows prune to one exact provider key. |
| `resourceId` | Optional | Narrows prune to provider job logs whose deployment belongs to one resource. |
| `serverId` | Optional | Narrows prune to provider job logs whose deployment belongs to one deployment target/server. |
| `dryRun` | Optional | Defaults to `true`. When true, returns counts without deleting rows. |

## Admission Flow

The command must:

1. Validate command input.
2. Normalize omitted `dryRun` to `true`.
3. Count retained provider job log rows older than `before`, optionally filtered by deployment,
   provider, resource, and server.
4. Return counts by provider key.
5. If `dryRun` is `false`, delete only the counted rows.

## Rules

- Dry-run must not mutate persistence.
- Destructive prune requires explicit `dryRun = false`.
- Matching uses `createdAt < before`; cutoff-equal rows are retained.
- The command deletes only `provider_job_logs` rows.
- Rows outside deployment/provider/resource/server filters are retained.
- Provider job log payloads are not returned.
- Delete safety may change after destructive prune because retained provider job log rows are one
  blocker source.

## Entrypoints

| Entrypoint | Contract |
| --- | --- |
| CLI | `appaloft provider-job-log prune --before <iso> [--deployment <deploymentId>] [--provider <providerKey>] [--resource <resourceId>] [--server <serverId>] [--dry-run false]` dispatches this command. |
| API/oRPC | `POST /api/provider-job-logs/prune` uses the same command schema. |
| Web | Future operator maintenance UI may call the same command after showing a dry-run preview. |

## Error Contract

| Code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `command-validation` | No | Input is missing or malformed. |
| `infra_error` | `provider-job-log-retention` | Conditional | The count or delete operation could not be completed. |

## Tests

The governing matrix is
[Provider Job Log Retention Test Matrix](../testing/provider-job-log-retention-test-matrix.md).
At minimum, Code Round coverage must prove:

- dry-run returns eligible counts without deleting rows;
- destructive prune deletes only old matching provider job log rows;
- cutoff-equal, newer, and out-of-scope rows are retained;
- deployment rows and embedded deployment logs remain untouched;
- CLI and HTTP/oRPC dispatch use the shared command schema.

## Current Implementation Notes And Migration Gaps

This command covers only retained provider job rows in `provider_job_logs`. Deployment log
retention, resource runtime log archival, domain event stream retention, outbox/inbox retention,
audit export holds, legal holds, organization retention defaults, and immutable archive export
remain future governed slices.
