# audit-events.archives.list Query Spec

## Metadata

- Operation key: `audit-events.archives.list`
- Query class: `ListAuditEventArchivesQuery`
- Input schema: `ListAuditEventArchivesQueryInput`
- Handler: `ListAuditEventArchivesQueryHandler`
- Query service: `ListAuditEventArchivesQueryService`
- Domain / bounded context: Operator audit history
- Current status: accepted candidate

## Normative Contract

`audit-events.archives.list` returns safe summaries of retained audit archive records.

Query success means Appaloft read archive metadata and returned bounded summaries. It does not read
raw audit payloads, mutate archive records, mutate source audit rows, create legal holds, prune
retention, or touch domain event streams, outbox/inbox records, process attempts, runtime/provider
or deployment logs, snapshots outside the archive store, runtime artifacts, business state, routes,
dependencies, or storage volumes.

## Input Model

| Field | Requirement | Meaning |
| --- | --- | --- |
| `aggregateId` | Optional | Narrows list to archives whose source selection includes one aggregate id. |
| `eventType` | Optional | Narrows list to archives whose source selection includes one exact event type. |
| `from` | Optional | Includes archives created at or after the timestamp. |
| `to` | Optional | Includes archives created before the timestamp. |
| `limit` | Optional | Positive integer capped by the implementation. |
| `cursor` | Optional | Opaque pagination cursor. |

## Result Model

Each summary must include:

- archive id;
- schema version;
- source selection summary;
- reason;
- item count;
- truncation status;
- content digest;
- source-row reference retention status;
- created time.

## Rules

- Query output must not include archived item payloads; `show` owns item readback.
- Output must be ordered deterministically by created time descending and archive id.
- `to` is exclusive.
- The query is not an archive creation command, legal hold, global export, or retention mutation.

## Entrypoints

| Entrypoint | Contract |
| --- | --- |
| CLI | `appaloft audit-event archive list [--aggregate <aggregateId>] [--event-type <eventType>] [--from <iso>] [--to <iso>] [--limit <n>]` dispatches this query. |
| API/oRPC | `GET /api/audit-events/archives` uses the same query schema. |
| Web | Future operator maintenance UI may call the same query. |

## Error Contract

| Code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `command-validation` | No | Input is malformed or has an invalid time range. |
| `infra_error` | `audit-event-archive-list` | Conditional | Archive read could not be completed. |

## Tests

The governing matrix is [Audit Event Read Surface Test Matrix](../testing/audit-event-read-surface-test-matrix.md).
At minimum, Code Round coverage must prove:

- list returns safe archive summaries without item payloads;
- filters and pagination are honored;
- CLI and HTTP/oRPC dispatch use the shared query schema.

## Current Implementation Notes And Migration Gaps

This query is specified but not implemented. Code Round still needs application, persistence, CLI,
HTTP/oRPC, operation catalog, public docs/help, OpenAPI/SDK, and verification coverage.
