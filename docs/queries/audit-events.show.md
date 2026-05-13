# audit-events.show

## Status

Active query.

## Purpose

`audit-events.show` reads one retained audit event for one aggregate id and returns only a safe,
redacted payload for support and operator history review.

## Input

| Field | Required | Meaning |
| --- | --- | --- |
| `auditEventId` | yes | Audit event id. |
| `aggregateId` | yes | Aggregate id that must own the event. |

## Output

Returns `audit-events.show/v1` with:

- `event.auditEventId`;
- `event.aggregateId`;
- `event.eventType`;
- `event.createdAt`;
- `event.payload`, limited to primitive values, string arrays, and redaction markers;
- `event.redactedFields`, listing payload keys that were masked.

## Redaction

The read model must not return raw private keys, tokens, secrets, environment values, certificate
material, signatures, credential payloads, provider-native objects, command output, or nested raw
payloads. Unsafe fields are replaced with `"[redacted]"`, and their keys appear in
`redactedFields`.

## Rules

- The query is read-only and must not mutate audit retention, deletion safety, runtime state,
  workflow state, or retry state.
- Aggregate scope is required; mismatched aggregate id returns not-found copy rather than leaking
  the event.
- Transport adapters must dispatch `ShowAuditEventQuery` through `QueryBus`.

## Errors

| Code | Category | Phase | Meaning |
| --- | --- | --- | --- |
| `audit_event_scope_required` | user | `audit-event-read` | `aggregateId` was omitted. |
| `audit_event_not_found` | user | `audit-event-read` | No visible audit event matched `auditEventId + aggregateId`. |
