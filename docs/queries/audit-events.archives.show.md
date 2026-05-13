# audit-events.archives.show Query Spec

## Metadata

- Operation key: `audit-events.archives.show`
- Query class: `ShowAuditEventArchiveQuery`
- Input schema: `ShowAuditEventArchiveQueryInput`
- Handler: `ShowAuditEventArchiveQueryHandler`
- Query service: `ShowAuditEventArchiveQueryService`
- Domain / bounded context: Operator audit history
- Current status: accepted candidate

## Normative Contract

`audit-events.archives.show` returns one retained audit archive record with safe redacted archived
items and integrity metadata.

Query success means Appaloft read one archive and returned immutable metadata plus the redacted
items stored at creation time. It does not re-read source audit rows, mutate archive records, mutate
source audit rows, create legal holds, prune retention, or touch domain event streams, outbox/inbox
records, process attempts, runtime/provider or deployment logs, snapshots outside the archive
store, runtime artifacts, business state, routes, dependencies, or storage volumes.

## Input Model

| Field | Requirement | Meaning |
| --- | --- | --- |
| `archiveId` | Required | Audit archive id. |

## Result Model

The result must include:

- archive id;
- schema version;
- source filters;
- reason;
- generated/created time;
- item count;
- truncation status;
- content digest;
- source-row reference retention status;
- redacted archived items;
- redacted fields per item.

## Rules

- Show returns archived items as they were redacted at archive creation time. It must not silently
  regenerate archive content from current audit rows.
- Missing archives return `audit_event_archive_not_found`.
- Output must never include raw secrets, private keys, access tokens, raw command output,
  certificate material, provider-native payloads, or nested sensitive values.
- The query is not an archive creation command, legal hold, global export, or retention mutation.

## Entrypoints

| Entrypoint | Contract |
| --- | --- |
| CLI | `appaloft audit-event archive show <archiveId>` dispatches this query. |
| API/oRPC | `GET /api/audit-events/archives/{archiveId}` uses the same query schema. |
| Web | Future operator maintenance UI may call the same query. |

## Error Contract

| Code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `command-validation` | No | Input is malformed. |
| `audit_event_archive_not_found` | `audit-event-archive-show` | No | The archive id does not exist or is not visible. |
| `infra_error` | `audit-event-archive-show` | Conditional | Archive read could not be completed. |

## Tests

The governing matrix is [Audit Event Read Surface Test Matrix](../testing/audit-event-read-surface-test-matrix.md).
At minimum, Code Round coverage must prove:

- show returns immutable archived redacted rows and digest metadata;
- missing archive returns a structured not-found error;
- show does not re-read source audit rows;
- CLI and HTTP/oRPC dispatch use the shared query schema.

## Current Implementation Notes And Migration Gaps

This query is specified but not implemented. Code Round still needs application, persistence, CLI,
HTTP/oRPC, operation catalog, public docs/help, OpenAPI/SDK, and verification coverage.
