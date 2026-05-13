# audit-events.archives.create Command Spec

## Metadata

- Operation key: `audit-events.archives.create`
- Command class: `CreateAuditEventArchiveCommand`
- Input schema: `CreateAuditEventArchiveCommandInput`
- Handler: `CreateAuditEventArchiveCommandHandler`
- Use case: `CreateAuditEventArchiveUseCase`
- Domain / bounded context: Operator audit history
- Current status: accepted candidate

## Normative Contract

`audit-events.archives.create` creates an immutable retained archive snapshot from selected
redacted audit rows.

Command success means Appaloft selected bounded source rows from `audit_logs`, redacted payload
values with the same safety rules as `audit-events.show`, stored immutable archive metadata and
items, and returned safe archive metadata. It does not mutate legal holds, domain event streams,
outbox/inbox records, process attempts, runtime/provider/deployment logs, snapshots outside the
archive store, runtime artifacts, resource/server/deployment state, routes, dependency data,
storage volumes, or compatibility ledger rows.

## Input Model

| Field | Requirement | Meaning |
| --- | --- | --- |
| `reason` | Required | Human-readable reason for creating the retained archive. |
| `aggregateId` | Optional | Selects rows for one aggregate. Required unless both `from` and `to` define a global window. |
| `eventType` | Optional | Narrows archive source rows to one exact event type. |
| `from` | Required for global archive; optional with aggregate scope | Includes rows with `createdAt >= from`. |
| `to` | Required for global archive; optional with aggregate scope | Includes rows with `createdAt < to`. |
| `limit` | Optional | Positive integer capped by the implementation's archive row maximum. |
| `retainSourceRows` | Optional | When true, the retained archive guards referenced source audit rows from `audit-events.prune` until the archive is pruned. |

## Admission Flow

The command must:

1. Validate command input and reject empty reasons.
2. Require either `aggregateId` or a valid `from < to` global time window.
3. Read matching retained audit rows using the same redaction rules as `audit-events.show`.
4. Enforce the archive row cap and report truncation when more rows match.
5. Compute a deterministic digest over the archive schema version, source filters, metadata, and
   redacted rows.
6. Persist an immutable archive record and items.
7. Return safe archive metadata.

## Rules

- Archive creation must never store raw secrets, private keys, access tokens, raw command output,
  certificate material, provider-native payloads, or nested sensitive values.
- `to` is exclusive so global archive windows can be chained without overlap.
- A zero-row archive may be allowed only when the result clearly records `itemCount = 0`.
- Archive records must not be modified after creation except for retention/prune metadata.
- `retainSourceRows` creates an audit prune guard only for referenced source rows and only while
  the archive remains retained.
- The command is not a legal hold, global export, event stream export, organization retention
  default, or scheduled retention policy.

## Entrypoints

| Entrypoint | Contract |
| --- | --- |
| CLI | `appaloft audit-event archive create --reason <text> [--aggregate <aggregateId>] [--event-type <eventType>] [--from <iso>] [--to <iso>] [--limit <n>] [--retain-source-rows]` dispatches this command. |
| API/oRPC | `POST /api/audit-events/archives` uses the same command schema. |
| Web | Future operator maintenance UI may call the same command after showing source scope, row count, digest, and retention impact. |

## Error Contract

| Code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `command-validation` | No | Input is missing, malformed, or has an invalid time range. |
| `audit_event_archive_scope_required` | `audit-event-archive-create` | No | The request supplied neither aggregate scope nor a bounded global time window. |
| `infra_error` | `audit-event-archive-create` | Conditional | Archive read, digest, or persistence could not be completed. |

## Tests

The governing matrix is [Audit Event Read Surface Test Matrix](../testing/audit-event-read-surface-test-matrix.md).
At minimum, Code Round coverage must prove:

- aggregate archive creation stores safe immutable metadata and redacted rows;
- global archive creation requires `from < to`;
- digest output is deterministic for the archived content;
- source-row reference retention is recorded when requested;
- CLI and HTTP/oRPC dispatch use the shared command schema.

## Current Implementation Notes And Migration Gaps

This command is specified but not implemented. Code Round still needs application, persistence,
CLI, HTTP/oRPC, operation catalog, public docs/help, OpenAPI/SDK, and verification coverage.
