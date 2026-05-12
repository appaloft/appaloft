# ADR-056: Global Audit Event Export Boundary

Status: Accepted

Date: 2026-05-12

## Context

ADR-051 introduced `audit-events.export` as a bounded, aggregate-scoped, redacted export for one
aggregate. Phase 9 still lists global audit export as a remaining audit/event retention gap.

Operators sometimes need a platform-wide audit extract for incident triage, support handoff, or
release-readiness evidence. Reusing `audit-events.export` for that purpose would weaken its
aggregate-scope guarantee and blur the line between a support export, a legal hold, and an
immutable compliance archive.

## Decision

Appaloft introduces `audit-events.export-global` as a separate read-only query over retained
`audit_logs` rows.

The query must:

- require a bounded time window with `from` and `to`;
- optionally narrow by aggregate id and event type;
- cap `limit` at a conservative maximum and report `truncated` when more rows match;
- return redacted audit event details using the same payload safety rules as `audit-events.show`;
- include export metadata with schema version, generated time, effective filters, item count, and
  truncation status;
- dispatch through `QueryBus` from CLI and HTTP/oRPC surfaces;
- never mutate audit retention, legal holds, event streams, outbox/inbox records, process attempts,
  runtime/provider/deployment logs, snapshots, runtime artifacts, or business state.

`audit-events.export-global` is an operator support export of retained rows. It is not a legal hold,
immutable archive, replay source, event stream export, organization retention default, or scheduled
retention automation.

## Consequences

- `audit-events.export` remains aggregate-scoped and keeps its existing operation key and response
  shape.
- Global export receives its own operation catalog entry, command/query spec, matrix rows, public
  docs/help coverage, and entrypoint tests before implementation can be considered complete.
- The first implementation may reuse the existing `audit_logs` read model and redaction rules, but
  it must keep global export input validation and metadata distinct from aggregate export.
- Legal hold, immutable archive storage, organization retention defaults, domain event stream
  retention, outbox/inbox retention, and scheduled retention automation remain separate governed
  slices.

## Governed Specs

- [audit-events.export-global Query Spec](../queries/audit-events.export-global.md)
- [Global Audit Event Export](../specs/062-global-audit-event-export/spec.md)
- [Audit Event Read Surface Test Matrix](../testing/audit-event-read-surface-test-matrix.md)
- [ADR-048: Audit Event Retention Policy](./ADR-048-audit-event-retention-policy.md)
- [ADR-051: Audit Event Export Boundary](./ADR-051-audit-event-export-boundary.md)
