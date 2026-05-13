# audit-events.legal-holds.list Query Spec

## Metadata

- Operation key: `audit-events.legal-holds.list`
- Query class: `ListAuditEventLegalHoldsQuery`
- Input schema: `ListAuditEventLegalHoldsQueryInput`
- Handler: `ListAuditEventLegalHoldsQueryHandler`
- Query service: `ListAuditEventLegalHoldsQueryService`
- Domain / bounded context: Operator audit history
- Current status: planned query

## Normative Contract

`audit-events.legal-holds.list` returns safe legal hold summaries without exposing audit payloads or
mutating retention state.

## Input Model

| Field | Requirement | Meaning |
| --- | --- | --- |
| `status` | Optional | Narrows to `active` or `released` holds. |
| `aggregateId` | Optional | Narrows to holds scoped to one aggregate. |
| `eventType` | Optional | Narrows to holds scoped to one event type. |
| `limit` | Optional | Positive integer capped at 100. Defaults to 50. |
| `cursor` | Optional | Pagination cursor from a previous response. |

## Result Model

The result uses schema version `audit-events.legal-holds.list/v1` and includes:

- safe hold summaries;
- optional `nextCursor`;
- `generatedAt`.

Each summary includes hold id, status, scope, optional event type, reason, created/released
timestamps, and safe requested/released-by labels when available. It never includes audit payloads.

## Entrypoints

| Entrypoint | Contract |
| --- | --- |
| CLI | `appaloft audit-event legal-hold list [--status active|released] [--aggregate <aggregateId>] [--event-type <eventType>]` dispatches this query. |
| API/oRPC | `GET /api/audit-events/legal-holds` uses the same query schema. |
| Web | Future operator maintenance UI may call the same query. |

## Error Contract

| Code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `command-validation` | No | Input is malformed. |
| `infra_error` | `audit-event-legal-hold` | Conditional | Hold readback could not be completed. |

## Tests

The governing matrix is [Audit Event Read Surface Test Matrix](../testing/audit-event-read-surface-test-matrix.md).
At minimum, Code Round coverage must prove safe list readback, filtering, pagination cursor shape,
and CLI/HTTP dispatch.

## Current Implementation Notes And Migration Gaps

This query is specified but not implemented.
