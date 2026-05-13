# audit-events.legal-holds.show Query Spec

## Metadata

- Operation key: `audit-events.legal-holds.show`
- Query class: `ShowAuditEventLegalHoldQuery`
- Input schema: `ShowAuditEventLegalHoldQueryInput`
- Handler: `ShowAuditEventLegalHoldQueryHandler`
- Query service: `ShowAuditEventLegalHoldQueryService`
- Domain / bounded context: Operator audit history
- Current status: planned query

## Normative Contract

`audit-events.legal-holds.show` returns one safe legal hold detail without exposing audit payloads
or mutating retention state.

## Input Model

| Field | Requirement | Meaning |
| --- | --- | --- |
| `holdId` | Required | Legal hold id to read. |

## Result Model

The result uses schema version `audit-events.legal-holds.show/v1` and includes one hold detail with
status, scope, optional event type, reason, created/released timestamps, safe requested/released-by
labels when available, and generated time.

## Entrypoints

| Entrypoint | Contract |
| --- | --- |
| CLI | `appaloft audit-event legal-hold show <holdId>` dispatches this query. |
| API/oRPC | `GET /api/audit-events/legal-holds/{holdId}` uses the same query schema. |
| Web | Future operator maintenance UI may call the same query. |

## Error Contract

| Code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `command-validation` | No | Input is malformed. |
| `audit_event_legal_hold_not_found` | `audit-event-legal-hold` | No | The requested hold does not exist or is not visible. |
| `infra_error` | `audit-event-legal-hold` | Conditional | Hold readback could not be completed. |

## Tests

The governing matrix is [Audit Event Read Surface Test Matrix](../testing/audit-event-read-surface-test-matrix.md).
At minimum, Code Round coverage must prove safe detail readback, not-found behavior, and CLI/HTTP
dispatch.

## Current Implementation Notes And Migration Gaps

This query is specified but not implemented.
