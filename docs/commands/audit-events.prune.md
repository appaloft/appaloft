# audit-events.prune Command Spec

## Metadata

- Operation key: `audit-events.prune`
- Command class: `PruneAuditEventsCommand`
- Input schema: `PruneAuditEventsCommandInput`
- Handler: `PruneAuditEventsCommandHandler`
- Use case: `PruneAuditEventsUseCase`
- Domain / bounded context: Operator audit history
- Current status: active command

## Normative Contract

`audit-events.prune` previews or deletes retained audit rows from `audit_logs`.

Command success means Appaloft counted matching audit rows and, when `dryRun` is `false`, deleted
only matching audit rows. It does not mutate domain event streams, outbox/inbox records,
process-attempt journals, runtime logs, provider job logs, deployment snapshots, remote-state
backups, runtime artifacts, resource/server/deployment state, routes, dependency data, storage
volumes, or compatibility ledger rows.

## Input Model

| Field | Requirement | Meaning |
| --- | --- | --- |
| `before` | Required | ISO timestamp cutoff. Only rows with `createdAt < before` are eligible. |
| `aggregateId` | Optional | Narrows prune to one aggregate id. |
| `eventType` | Optional | Narrows prune to one exact event type. |
| `dryRun` | Optional | Defaults to `true`. When true, returns counts without deleting rows. |

## Admission Flow

The command must:

1. Validate command input.
2. Normalize omitted `dryRun` to `true`.
3. Count retained audit rows older than `before`, optionally filtered by `aggregateId` and
   `eventType`.
4. Return counts by event type.
5. If `dryRun` is `false`, delete only the counted rows.

## Rules

- Dry-run must not mutate persistence.
- Destructive prune requires explicit `dryRun = false`.
- Matching uses `createdAt < before`; cutoff-equal rows are retained.
- The command deletes only `audit_logs` rows.
- Active audit legal holds must exclude matching rows from destructive deletion and report
  held/skipped counts.
- Retained immutable archive snapshots with source-row reference retention must exclude referenced
  source rows from destructive deletion and report archive-retained/skipped counts while the archive
  remains retained.
- Rows outside the aggregate/event filters are retained.
- Server delete safety may change after destructive prune because retained audit rows are one
  blocker source. Project and Resource delete safety must not require audit prune, because retained
  audit rows are past-tense facts that may continue to reference tombstoned project/resource ids.

## Entrypoints

| Entrypoint | Contract |
| --- | --- |
| CLI | `appaloft audit-event prune --before <iso> [--aggregate <aggregateId>] [--event-type <eventType>] [--dry-run false]` dispatches this command. |
| API/oRPC | `POST /api/audit-events/prune` uses the same command schema. |
| Web | Future operator maintenance UI may call the same command after showing a dry-run preview. |

## Error Contract

| Code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `command-validation` | No | Input is missing or malformed. |
| `infra_error` | `audit-event-retention` | Conditional | The count or delete operation could not be completed. |

## Tests

The governing matrix is [Audit Event Read Surface Test Matrix](../testing/audit-event-read-surface-test-matrix.md).
At minimum, Code Round coverage must prove:

- dry-run returns eligible counts without deleting rows;
- destructive prune deletes only old matching audit rows;
- cutoff-equal, newer, and out-of-scope rows are retained;
- CLI and HTTP/oRPC dispatch use the shared command schema.

## Current Implementation Notes And Migration Gaps

This command covers only retained audit rows in `audit_logs`. Legal holds are implemented and prune
skips rows matched by active holds. Immutable archive source-row reference retention is implemented
through ADR-058 and `docs/specs/064-audit-event-immutable-archive`; prune skips rows referenced by
retained archives and reports archive-retained counts. Domain event stream retention, durable
process-attempt retention, runtime/provider/deployment log retention, and organization retention
defaults are governed by separate active slices and commands.
