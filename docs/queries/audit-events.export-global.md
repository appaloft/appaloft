# audit-events.export-global Query Spec

## Metadata

- Operation key: `audit-events.export-global`
- Query class: `ExportGlobalAuditEventsQuery`
- Input schema: `ExportGlobalAuditEventsQueryInput`
- Handler: `ExportGlobalAuditEventsQueryHandler`
- Query service: `ExportGlobalAuditEventsQueryService`
- Domain / bounded context: Operator audit history
- Current status: planned query

## Normative Contract

`audit-events.export-global` returns a bounded, copy-safe export of retained audit rows across
aggregates.

Query success means Appaloft read matching rows from `audit_logs`, redacted payload values with the
same safety rules as `audit-events.show`, and returned export metadata. It does not mutate audit
retention, legal holds, domain event streams, outbox/inbox records, process attempts,
runtime/provider/deployment logs, snapshots, runtime artifacts, resource/server/deployment state,
routes, dependency data, storage volumes, or compatibility ledger rows.

## Input Model

| Field | Requirement | Meaning |
| --- | --- | --- |
| `from` | Required | Includes rows with `createdAt >= from`. |
| `to` | Required | Includes rows with `createdAt < to`. |
| `aggregateId` | Optional | Narrows export to one aggregate while preserving global export metadata and operation identity. |
| `eventType` | Optional | Narrows export to one exact event type. |
| `limit` | Optional | Positive integer capped at 500. Defaults to 100. |

## Result Model

The result uses schema version `audit-events.export-global/v1` and includes:

- `filters` with the effective required and optional filters;
- redacted `items`;
- `itemCount`;
- `truncated`, true when more matching rows exist beyond the limit;
- `generatedAt`.

`items` use the same safe detail shape as `audit-events.show`: primitive values and string arrays
are preserved unless the key is sensitive; sensitive or nested values become `[redacted]` and are
listed in `redactedFields`.

## Rules

- `from` and `to` are required for every global export.
- Rows are ordered by `createdAt` ascending and then stable audit event id for deterministic
  copy/export output.
- `to` is exclusive so exports can be chained without overlap.
- `from` must be earlier than `to`.
- The query must never return raw shell output, credentials, environment values, private keys,
  signatures, tokens, certificate material, provider-native payloads, or nested sensitive values.
- The query is not a legal hold, immutable archive, replay source, organization retention policy,
  or scheduled retention automation.

## Entrypoints

| Entrypoint | Contract |
| --- | --- |
| CLI | `appaloft audit-event export-global --from <iso> --to <iso> [--aggregate <aggregateId>] [--event-type <eventType>] [--limit <n>]` dispatches this query. |
| API/oRPC | `GET /api/audit-events/export-global` uses the same query schema. |
| Web | Future operator maintenance UI may call the same query for incident triage or support handoff. |

## Error Contract

| Code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `command-validation` | No | Input is missing, malformed, or has an invalid time range. |
| `audit_event_window_required` | `audit-event-export-global` | No | `from` or `to` was omitted. |
| `infra_error` | `audit-event-export-global` | Conditional | Export read could not be completed. |

## Tests

The governing matrix is [Audit Event Read Surface Test Matrix](../testing/audit-event-read-surface-test-matrix.md).
At minimum, Code Round coverage must prove:

- `from` and `to` are required;
- export returns redacted details and metadata across aggregates;
- aggregate id, event type, and time filters are honored with `to` exclusive;
- output is bounded and reports truncation;
- CLI and HTTP/oRPC dispatch use the shared query schema.

## Current Implementation Notes And Migration Gaps

This query is specified but not implemented. Aggregate-scoped `audit-events.export` remains the only
active audit export operation until Code Round adds application, persistence, CLI, HTTP/oRPC,
operation catalog, public docs/help, and verification coverage for global export.
