# ADR-057: Audit Event Legal Hold Boundary

Status: Accepted

Date: 2026-05-12

## Context

ADR-048 introduced dry-run-first audit row pruning. ADR-051 and ADR-056 introduced bounded
aggregate and global audit export queries. Phase 9 still lists legal hold as a remaining
audit/event retention gap.

Operators need a way to preserve retained audit rows for an incident, support case, or compliance
review before running destructive retention commands. Without a governed hold boundary,
`audit-events.prune` can safely dry-run and delete by cutoff, but it cannot distinguish rows that
must be retained for an active review.

## Decision

Appaloft introduces audit event legal holds as Appaloft-owned retention guard records over retained
`audit_logs` rows.

The first legal-hold slice must:

- create an explicit hold record through `audit-events.legal-holds.configure`;
- require a human-readable reason and either aggregate scope or a bounded global time window;
- optionally narrow held rows by event type;
- expose safe readback through `audit-events.legal-holds.list` and
  `audit-events.legal-holds.show`;
- release a hold through `audit-events.legal-holds.release` while retaining the hold history;
- make `audit-events.prune` exclude rows matched by active holds, including destructive prune;
- return hold-blocked counts or hold references when prune skips eligible old rows because of an
  active hold;
- never mutate domain event streams, outbox/inbox records, process attempts, runtime/provider or
  deployment logs, snapshots, runtime artifacts, resources, servers, deployments, routes,
  dependencies, or storage volumes.

Legal holds preserve retained audit rows. They do not create immutable archive storage, signed
export bundles, legal discovery workflows, organization retention defaults, event stream retention,
or scheduled retention automation.

## Consequences

- `audit-events.prune` remains dry-run-first and cutoff-based, but Code Round must update its
  selection rules to skip held rows and expose skipped/held counts.
- Legal hold records require a persistence migration and PGlite/PostgreSQL tests in the
  implementation slice.
- CLI and HTTP/oRPC surfaces must dispatch through `CommandBus` and `QueryBus` using shared
  application schemas.
- Public docs/help must describe holds as retention blockers, not immutable archives or legal
  discovery products.
- Server delete safety may continue to report retained audit rows; holds explain why old rows are
  still retained after prune. Resource delete safety does not treat retained audit rows as blockers.

## Governed Specs

- [Audit Event Legal Hold](../specs/063-audit-event-legal-hold/spec.md)
- [audit-events.legal-holds.configure Command Spec](../commands/audit-events.legal-holds.configure.md)
- [audit-events.legal-holds.release Command Spec](../commands/audit-events.legal-holds.release.md)
- [audit-events.legal-holds.list Query Spec](../queries/audit-events.legal-holds.list.md)
- [audit-events.legal-holds.show Query Spec](../queries/audit-events.legal-holds.show.md)
- [Audit Event Read Surface Test Matrix](../testing/audit-event-read-surface-test-matrix.md)
- [ADR-048: Audit Event Retention Policy](./ADR-048-audit-event-retention-policy.md)
- [ADR-051: Audit Event Export Boundary](./ADR-051-audit-event-export-boundary.md)
- [ADR-056: Global Audit Event Export Boundary](./ADR-056-global-audit-event-export-boundary.md)
