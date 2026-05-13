# audit-events.archives.prune Command Spec

## Metadata

- Operation key: `audit-events.archives.prune`
- Command class: `PruneAuditEventArchivesCommand`
- Input schema: `PruneAuditEventArchivesCommandInput`
- Handler: `PruneAuditEventArchivesCommandHandler`
- Use case: `PruneAuditEventArchivesUseCase`
- Domain / bounded context: Operator audit history
- Current status: accepted candidate

## Normative Contract

`audit-events.archives.prune` previews or deletes retained audit archive records.

Command success means Appaloft counted matching archive records and, when `dryRun` is `false`,
deleted only matching archive records and their archive items. It does not delete source audit
rows, legal holds, domain event streams, outbox/inbox records, process-attempt journals, runtime
logs, provider job logs, deployment snapshots, remote-state backups, runtime artifacts,
resource/server/deployment state, routes, dependency data, storage volumes, or compatibility ledger
rows.

## Input Model

| Field | Requirement | Meaning |
| --- | --- | --- |
| `before` | Required | ISO timestamp cutoff. Only archive records with `createdAt < before` are eligible. |
| `aggregateId` | Optional | Narrows prune to archives whose source selection includes one aggregate id. |
| `eventType` | Optional | Narrows prune to archives whose source selection includes one exact event type. |
| `dryRun` | Optional | Defaults to `true`. When true, returns counts without deleting archive records. |

## Admission Flow

The command must:

1. Validate command input.
2. Normalize omitted `dryRun` to `true`.
3. Count retained archive records older than `before`, optionally filtered by source aggregate id
   and event type.
4. Return counts by archive source kind and event type where available.
5. If `dryRun` is `false`, delete only the counted archive records and their archive items.

## Rules

- Dry-run must not mutate persistence.
- Destructive archive prune requires explicit `dryRun = false`.
- Matching uses archive `createdAt < before`; cutoff-equal archives are retained.
- The command deletes only audit archive records and archive items.
- Deleting an archive removes only that archive's source-row reference retention guard. It does not
  delete source audit rows; a later `audit-events.prune` command must still evaluate audit row
  eligibility, legal holds, and other blockers.

## Entrypoints

| Entrypoint | Contract |
| --- | --- |
| CLI | `appaloft audit-event archive prune --before <iso> [--aggregate <aggregateId>] [--event-type <eventType>] [--dry-run false]` dispatches this command. |
| API/oRPC | `POST /api/audit-events/archives/prune` uses the same command schema. |
| Web | Future operator maintenance UI may call the same command after showing a dry-run preview. |

## Error Contract

| Code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `command-validation` | No | Input is missing or malformed. |
| `infra_error` | `audit-event-archive-prune` | Conditional | The count or delete operation could not be completed. |

## Tests

The governing matrix is [Audit Event Read Surface Test Matrix](../testing/audit-event-read-surface-test-matrix.md).
At minimum, Code Round coverage must prove:

- dry-run returns eligible archive counts without deleting archive records;
- destructive prune deletes only old matching archive records and items;
- cutoff-equal, newer, and out-of-scope archives are retained;
- pruning an archive does not delete source audit rows;
- CLI and HTTP/oRPC dispatch use the shared command schema.

## Current Implementation Notes And Migration Gaps

This command is specified but not implemented. Code Round still needs application, persistence,
CLI, HTTP/oRPC, operation catalog, public docs/help, OpenAPI/SDK, and verification coverage.
