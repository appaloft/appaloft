# ADR-058: Audit Event Immutable Archive Boundary

Status: Accepted

Date: 2026-05-12

## Context

ADR-048 introduced dry-run-first audit row pruning. ADR-051 and ADR-056 introduced bounded
redacted audit export queries, and ADR-057 introduced legal holds that block destructive prune while
an incident, support, or compliance review is active.

Phase 9 still lists immutable audit archive as a remaining audit/event retention gap. Reusing audit
export output as the immutable archive would blur an operator support read with a retained evidence
record. Reusing legal holds would also be wrong: a hold keeps source audit rows from being pruned
but does not create a bounded retained archive snapshot with integrity metadata.

## Decision

Appaloft introduces audit event immutable archives as explicit Appaloft-owned retained archive
snapshots derived from redacted `audit_logs` rows.

The first archive slice must:

- create an archive snapshot through `audit-events.archives.create`;
- require a bounded source selection: either one aggregate with optional time bounds or a required
  global time window with `from` and `to`;
- optionally narrow by exact event type;
- capture only redacted audit event detail rows using the same payload safety rules as
  `audit-events.show`;
- record immutable archive metadata including schema version, source filters, generated time, item
  count, truncation status, and a deterministic content digest;
- expose safe readback through `audit-events.archives.list` and `audit-events.archives.show`;
- prune archive snapshot records only through dry-run-first `audit-events.archives.prune`;
- keep archive records immutable after creation except for retention/prune metadata;
- make `audit-events.prune` report and skip rows retained only because active archive snapshots
  still reference them, when source-row reference retention is enabled by the archive record;
- never mutate domain event streams, outbox/inbox records, process attempts, runtime/provider or
  deployment logs, snapshots outside the archive store, runtime artifacts, resources, servers,
  deployments, routes, dependencies, or storage volumes.

Immutable archives are retained evidence snapshots. They are not legal holds, legal discovery
workflows, external compliance-system integrations, event replay sources, organization retention
defaults, or scheduled retention automation.

## Consequences

- `audit-events.export` and `audit-events.export-global` remain read-only support exports. Creating
  an immutable archive requires a separate command and durable archive record.
- `audit-events.legal-holds.*` continue to guard source rows while active. Archive retention guards
  source rows only when the archive record explicitly retains source-row references.
- Archive persistence requires a migration and PGlite/PostgreSQL tests for immutable payload
  storage, digest determinism, readback, and dry-run prune behavior.
- CLI and HTTP/oRPC surfaces must dispatch through `CommandBus` and `QueryBus` using shared
  application schemas.
- Public docs/help must describe archives as retained redacted snapshots, not legal holds or
  complete compliance/legal discovery products.

## Governed Specs

- [Audit Event Immutable Archive](../specs/064-audit-event-immutable-archive/spec.md)
- [audit-events.archives.create Command Spec](../commands/audit-events.archives.create.md)
- [audit-events.archives.prune Command Spec](../commands/audit-events.archives.prune.md)
- [audit-events.archives.list Query Spec](../queries/audit-events.archives.list.md)
- [audit-events.archives.show Query Spec](../queries/audit-events.archives.show.md)
- [Audit Event Read Surface Test Matrix](../testing/audit-event-read-surface-test-matrix.md)
- [ADR-048: Audit Event Retention Policy](./ADR-048-audit-event-retention-policy.md)
- [ADR-051: Audit Event Export Boundary](./ADR-051-audit-event-export-boundary.md)
- [ADR-056: Global Audit Event Export Boundary](./ADR-056-global-audit-event-export-boundary.md)
- [ADR-057: Audit Event Legal Hold Boundary](./ADR-057-audit-event-legal-hold-boundary.md)

## Migration Gaps

- This ADR specifies immutable audit archive semantics but does not implement the archive store,
  command/query handlers, CLI, HTTP/oRPC routes, or archive-aware audit prune.
- Domain event stream retention, outbox/inbox retention, organization defaults, and scheduled
  audit retention automation remain separate governed slices.
