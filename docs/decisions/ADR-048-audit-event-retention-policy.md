# ADR-048: Audit Event Retention Policy

Status: Accepted

Date: 2026-05-12

## Context

Appaloft now exposes aggregate-scoped audit history through `audit-events.list` and
`audit-events.show`, but those read surfaces intentionally do not mutate retention. Server delete
safety treats retained audit rows as blockers through the `audit-retention` blocker kind. Resource
delete safety does not treat retained audit rows as blockers, because audit rows are past-tense
facts and may continue to reference a tombstoned resource id.

Phase 9 requires explicit retention/prune behavior instead of leaving audit rows as permanent
opaque blockers. Audit retention is distinct from domain event streams, outbox/inbox processing,
runtime logs, provider logs, deployment snapshots, and process-attempt journals.

## Decision

Appaloft introduces `audit-events.prune` as the first audit retention mutation.

The command is operator maintenance over retained audit rows. It must:

- default to dry-run;
- require an ISO `before` cutoff;
- match only rows with `createdAt < before`;
- optionally narrow by `aggregateId` and/or exact `eventType`;
- return counts by event type;
- delete only `audit_logs` rows when `dryRun` is `false`;
- preserve cutoff-equal and newer rows;
- never mutate domain event streams, outbox/inbox records, process attempts, runtime logs, provider
  logs, deployment snapshots, remote-state backups, runtime artifacts, resource/server/deployment
  state, routes, dependency data, or storage volumes.

The command does not prove legal/compliance retention by itself. Hosted defaults, organization
policy, export holds, and immutable audit archives remain future slices. Until those exist, the
operator must supply the cutoff explicitly.

## Consequences

- `audit-events.list` and `audit-events.show` remain read-only.
- Server delete safety blockers continue to report retained audit rows. After a destructive
  `audit-events.prune` removes older rows, server delete-check results may change because the
  retained audit blocker source changed.
- Resource delete safety does not require audit prune. Resource audit rows remain queryable by
  aggregate id after the resource boundary is tombstoned.
- Event stream, outbox/inbox, provider-log, runtime-log, and deployment-log retention require
  separate specs and commands.
- CLI, HTTP/oRPC, and future MCP/tool surfaces must dispatch the same application command schema.

## Governed Specs

- [Audit Event Retention Policy](../specs/056-audit-event-retention-policy/spec.md)
- [audit-events.prune Command Spec](../commands/audit-events.prune.md)
- [Audit Event Read Surface Test Matrix](../testing/audit-event-read-surface-test-matrix.md)
- [Business Operation Map](../BUSINESS_OPERATION_MAP.md)
- [Core Operations](../CORE_OPERATIONS.md)
- [Adapter Command/Query Boundary](../architecture/adapter-command-query-boundary.md)
- [Error Model](../errors/model.md)

## Migration Gaps

- This slice prunes only `audit_logs` rows.
- Domain event streams, outbox/inbox state, runtime/provider logs, and deployment logs still need
  separate retention policies before the Phase 9 retention exit criterion is complete.
- Audit legal holds are governed by ADR-057 and implemented as a separate retention guard slice.
- Immutable archive storage is governed by ADR-058 but not implemented yet.
- Organization-level retention defaults are not modeled yet.
