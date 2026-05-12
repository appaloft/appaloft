# ADR-051: Audit Event Export Boundary

Status: Accepted

Date: 2026-05-12

## Context

ADR-048 introduced aggregate-scoped audit readback and dry-run-first audit row prune, but left audit
export, legal holds, organization defaults, and immutable archives as future slices.

Phase 9 still requires documented retention/prune behavior for historical attempts, logs, and
events. Operators also need a copy-safe way to export retained audit rows for one aggregate before a
delete or prune decision, without turning audit export into a global compliance archive.

## Decision

Appaloft introduces `audit-events.export` as a read-only query over retained `audit_logs` rows.

The query must:

- require aggregate scope;
- optionally narrow by event type and `from`/`to` time bounds;
- return redacted audit event details using the same payload safety rules as `audit-events.show`;
- enforce a bounded maximum row limit;
- include export metadata with schema version, generated time, filters, item count, and truncation
  status;
- dispatch through `QueryBus` from CLI and HTTP/oRPC surfaces;
- never mutate audit retention, legal holds, event streams, outbox/inbox records, process attempts,
  runtime/provider/deployment logs, snapshots, runtime artifacts, or business state.

`audit-events.export` is not a legal hold, immutable archive, or global audit export. It is an
operator support/export read for a single aggregate. Organization retention defaults, legal holds,
and immutable archive storage remain future governed slices. Global audit export is governed
separately by ADR-056 and remains unavailable until its Code Round is complete.

## Consequences

- `audit-events.list` and `audit-events.show` remain normal readback surfaces.
- `audit-events.prune` remains the only audit row retention mutation in this slice.
- The persistence adapter may stream or page internally later, but the public response remains
  bounded and redacted.
- Delete safety remains unchanged. Exporting audit events does not remove or weaken retained audit
  blockers.

## Governed Specs

- [audit-events.export Query Spec](../queries/audit-events.export.md)
- [Audit Event Retention Policy](../specs/056-audit-event-retention-policy/spec.md)
- [Audit Event Read Surface Test Matrix](../testing/audit-event-read-surface-test-matrix.md)
- [ADR-048: Audit Event Retention Policy](./ADR-048-audit-event-retention-policy.md)
