# audit-events.list

## Status

Active query.

## Purpose

`audit-events.list` reads retained audit event summaries for one aggregate id so operators can
explain historical changes without querying persistence tables directly or exposing raw payloads.

## Input

| Field | Required | Meaning |
| --- | --- | --- |
| `aggregateId` | yes | Aggregate or retained entity id whose audit history is being inspected. |
| `eventType` | no | Exact stored event type filter. |
| `limit` | no | Positive page size, max 100, default 50. |
| `cursor` | no | Previous page cursor based on `createdAt`. |

## Output

Returns `audit-events.list/v1` with:

- `items[]`: `auditEventId`, `aggregateId`, `eventType`, `createdAt`;
- `nextCursor` when more rows are available;
- `generatedAt`.

The list surface intentionally omits payload details. Call `audit-events.show` for one event's
safe, redacted payload.

## Rules

- The query is read-only and must not mutate audit retention, deletion safety, runtime state,
  workflow state, or retry state.
- Aggregate scope is required. This slice does not expose global audit log export.
- Transport adapters must dispatch `ListAuditEventsQuery` through `QueryBus`.
- The read model may read existing `audit_logs` rows directly through persistence/pg.

## Errors

| Code | Category | Phase | Meaning |
| --- | --- | --- | --- |
| `audit_event_scope_required` | user | `audit-event-read` | `aggregateId` was omitted. |
