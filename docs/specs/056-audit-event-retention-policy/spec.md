# Audit Event Retention Policy

## Status

- Round: Code Round plus Post-Implementation Sync
- Artifact state: implemented

## Business Outcome

Operators can preview and prune old retained audit rows with an explicit cutoff, reducing stale
server delete blockers and bounded storage growth without mutating event streams, process state,
runtime logs, deployment snapshots, or business aggregates.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Audit event | A retained audit row describing one aggregate-scoped historical change. | Operator audit history | audit log |
| Audit retention | The policy that keeps audit rows visible until explicitly pruned. It may block lifecycle deletion for aggregates whose delete safety owns audit retention, but it does not block Resource deletion. | Operator maintenance | audit history retention |
| Audit prune | A dry-run-first command that deletes only old audit rows selected by cutoff and optional scope. | Operator maintenance | audit cleanup |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| AUDIT-EVENT-PRUNE-001 | Dry-run by default | retained audit rows exist older than `before` | `audit-events.prune` omits `dryRun` | matching counts are returned and no row is deleted. |
| AUDIT-EVENT-PRUNE-002 | Destructive prune | retained audit rows are older than `before` | `dryRun` is `false` | only matching audit rows are deleted and counts by event type are returned. |
| AUDIT-EVENT-PRUNE-003 | Cutoff and scope safety | rows are newer, cutoff-equal, or outside aggregate/event scope | prune runs | those rows remain retained. |
| AUDIT-EVENT-PRUNE-004 | Entrypoints dispatch shared command | CLI or HTTP/oRPC invokes prune | inputs are parsed | adapters dispatch `PruneAuditEventsCommand` through `CommandBus`. |
| AUDIT-EVENT-EXPORT-001 | Bounded redacted export | retained audit rows exist for one aggregate | export runs with aggregate scope | Appaloft returns redacted detail rows, effective filters, generated time, item count, and truncation status without mutating retention. |

## Domain Ownership

- Bounded context: Operator audit history.
- Aggregate/resource owner: none; audit rows are retained read/history records scoped by aggregate
  id.
- Upstream/downstream contexts: server delete safety observes retained audit rows as blockers;
  resource delete safety keeps audit rows as retained facts without treating them as blockers.

## Public Surfaces

- API: `POST /api/audit-events/prune`.
- API: `GET /api/audit-events/export`.
- CLI: `appaloft audit-event prune --before <iso> [--aggregate <aggregateId>] [--event-type <eventType>] [--dry-run false]`.
- CLI: `appaloft audit-event export --aggregate <aggregateId> [--event-type <eventType>] [--from <iso>] [--to <iso>] [--limit <n>]`.
- Web/UI: future operator maintenance panel may call the same command after showing a dry-run
  preview.
- Config: none in this slice.
- Events: none in this slice.
- Public docs/help: `operator.audit-events`.

## Non-Goals

- Domain event stream retention.
- Outbox/inbox retention, retry, or dead-letter behavior.
- Runtime logs, provider job logs, deployment logs, process-attempt journal, remote-state backups,
  runtime artifacts, source workspaces, build cache, or deployment snapshot retention.
- Legal holds, organization retention defaults, immutable archive, global export, and scheduled
  history retention semantics are governed by their own ADR/spec slices and now integrate with this
  prune boundary where applicable.

## Current Implementation Notes And Migration Gaps

- Audit prune remains dry-run-first and requires an explicit `before` cutoff. Destructive prune
  without aggregate scope does not require a separate confirmation token in this slice.
- Legal holds and retained immutable archive source-row references are active skip/guard inputs for
  `audit-events.prune`.
- Domain event stream retention, outbox/inbox retention, and Web maintenance affordances remain
  separate governed slices.
