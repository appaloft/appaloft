# audit-events.export Query Spec

## Metadata

- Operation key: `audit-events.export`
- Query class: `ExportAuditEventsQuery`
- Input schema: `ExportAuditEventsQueryInput`
- Handler: `ExportAuditEventsQueryHandler`
- Query service: `ExportAuditEventsQueryService`
- Domain / bounded context: Operator audit history
- Current status: active query

## Normative Contract

`audit-events.export` returns a bounded, copy-safe export of retained audit rows for one aggregate.

Query success means Appaloft read matching rows from `audit_logs`, redacted payload values with the
same safety rules as `audit-events.show`, and returned export metadata. It does not mutate audit
retention, legal holds, domain event streams, outbox/inbox records, process attempts,
runtime/provider/deployment logs, snapshots, runtime artifacts, resource/server/deployment state,
routes, dependency data, storage volumes, or compatibility ledger rows.

## Input Model

| Field | Requirement | Meaning |
| --- | --- | --- |
| `aggregateId` | Required | Aggregate whose retained audit rows should be exported. |
| `eventType` | Optional | Narrows export to one exact event type. |
| `from` | Optional | Includes rows with `createdAt >= from`. |
| `to` | Optional | Includes rows with `createdAt < to`. |
| `limit` | Optional | Positive integer capped at 500. Defaults to 100. |

## Result Model

The result uses schema version `audit-events.export/v1` and includes:

- `aggregateId`;
- `filters` with the effective optional filters;
- redacted `items`;
- `itemCount`;
- `truncated`, true when more matching rows exist beyond the limit;
- `generatedAt`.

`items` use the same safe detail shape as `audit-events.show`: primitive values and string arrays
are preserved unless the key is sensitive; sensitive or nested values become `[redacted]` and are
listed in `redactedFields`.

## Rules

- Aggregate scope is required. This query does not provide global audit export; ADR-056 governs the
  separate planned `audit-events.export-global` operation.
- Rows are ordered by `createdAt` ascending for stable copy/export output.
- `to` is exclusive so exports can be chained without overlap.
- If both `from` and `to` are present, `from` must be earlier than `to`.
- The query must never return raw shell output, credentials, environment values, private keys,
  signatures, tokens, certificate material, provider-native payloads, or nested sensitive values.
- The query is not a legal hold, immutable archive, or organization retention policy.

## Entrypoints

| Entrypoint | Contract |
| --- | --- |
| CLI | `appaloft audit-event export --aggregate <aggregateId> [--event-type <eventType>] [--from <iso>] [--to <iso>] [--limit <n>]` dispatches this query. |
| API/oRPC | `GET /api/audit-events/export` uses the same query schema. |
| Web | Future operator maintenance UI may call the same query before prune/delete decisions. |

## Error Contract

| Code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `command-validation` | No | Input is missing, malformed, or has an invalid time range. |
| `audit_event_scope_required` | `audit-event-export` | No | `aggregateId` was omitted. |
| `infra_error` | `audit-event-export` | Conditional | Export read could not be completed. |

## Tests

The governing matrix is [Audit Event Read Surface Test Matrix](../testing/audit-event-read-surface-test-matrix.md).
At minimum, Code Round coverage must prove:

- aggregate scope is required;
- export returns redacted details and metadata;
- event type and time filters are honored with `to` exclusive;
- output is bounded and reports truncation;
- CLI and HTTP/oRPC dispatch use the shared query schema.

## Current Implementation Notes And Migration Gaps

This query exports only retained aggregate-scoped audit rows from `audit_logs`. Global audit export
is implemented separately by `audit-events.export-global` under ADR-056. Legal holds, immutable
archive storage, organization retention defaults, domain event stream retention, outbox/inbox
retention, and runtime/provider/deployment log retention remain future governed slices.
