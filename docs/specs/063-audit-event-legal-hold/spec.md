# Audit Event Legal Hold

## Status

- Round: Code Round
- Artifact state: implemented

## Business Outcome

Operators can preserve retained audit rows that are under incident, support, or compliance review
so destructive audit prune cannot remove them until an explicit release command is run.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Audit legal hold | A retained guard record that prevents matching audit rows from destructive prune. | Operator audit history | audit hold |
| Hold scope | The aggregate scope or bounded global time window selected by a hold. | Operator audit history | retention scope |
| Held audit row | A retained `audit_logs` row matched by at least one active audit legal hold. | Operator audit history | held row |
| Hold release | A command that marks a legal hold inactive while preserving hold history. | Operator audit history | release hold |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| AUDIT-EVENT-HOLD-001 | Configure aggregate hold | an operator needs to preserve one aggregate's audit rows | `audit-events.legal-holds.configure` runs with aggregate id and reason | Appaloft records an active hold and returns safe hold metadata. |
| AUDIT-EVENT-HOLD-002 | Configure bounded global hold | an operator needs a cross-aggregate incident window | configure runs with `from`, `to`, and reason | Appaloft records an active global-window hold bounded by the exclusive `to` timestamp. |
| AUDIT-EVENT-HOLD-003 | Prune skips held rows | old retained rows match active hold and prune cutoff | `audit-events.prune` dry-runs or destructively runs | held rows are counted as held/skipped and are not deleted. |
| AUDIT-EVENT-HOLD-004 | List/show safe hold readback | holds exist | list or show is queried | Appaloft returns safe scope, reason, status, timestamps, and release metadata without raw payloads. |
| AUDIT-EVENT-HOLD-005 | Release hold | an active hold no longer applies | `audit-events.legal-holds.release` runs with a release reason | Appaloft marks the hold released, keeps history readable, and later prune may delete matching rows if no other active hold applies. |
| AUDIT-EVENT-HOLD-006 | Entrypoints dispatch through buses | CLI or HTTP/oRPC manages holds | inputs are parsed | adapters dispatch hold commands/queries through `CommandBus` or `QueryBus` using shared schemas. |

## Domain Ownership

- Bounded context: Operator audit history.
- Aggregate/resource owner: none. Legal holds guard retained audit history records and do not own
  write-side aggregate behavior.
- Upstream/downstream contexts: `audit-events.prune` observes active holds before deleting retained
  audit rows; delete safety continues to observe retained audit rows as blockers.

## Public Surfaces

- API:
  - `POST /api/audit-events/legal-holds`
  - `GET /api/audit-events/legal-holds`
  - `GET /api/audit-events/legal-holds/{holdId}`
  - `POST /api/audit-events/legal-holds/{holdId}/release`
- CLI:
  - `appaloft audit-event legal-hold configure`
  - `appaloft audit-event legal-hold list`
  - `appaloft audit-event legal-hold show <holdId>`
  - `appaloft audit-event legal-hold release <holdId>`
- Web/UI: future operator maintenance panel may expose the same surfaces after showing held-row
  impact.
- Config: none in the first slice.
- Events: none in the first slice.
- Public docs/help: target existing operator audit events anchor until a broader retention page is
  introduced.

## Non-Goals

- Immutable archive storage or signed export bundles.
- Legal discovery workflow, approval workflow, or external compliance-system integration.
- Organization retention defaults.
- Domain event stream retention.
- Outbox/inbox retention.
- Scheduled retention automation.
- Runtime logs, provider job logs, deployment logs, process-attempt journal, remote-state backups,
  runtime artifacts, source workspaces, build cache, route state, resource/server/deployment state,
  dependencies, or storage volume retention.

## Current Implementation Notes And Migration Gaps

- Legal holds are implemented through application commands/queries, CLI and HTTP/oRPC entrypoints,
  persistence/pg storage, public docs/help coverage, operation catalog entries, and hold-aware
  audit prune behavior.
- Immutable archive storage, organization retention defaults, domain event stream retention, and
  scheduled history retention automation are governed by separate Phase 9 slices. ADR-054 defines
  durable process attempts as the current outbox/inbox-equivalent baseline, so accepted
  background-work retention is covered by `operator-work.prune`; a separate outbox/inbox retention
  command remains not applicable unless a future ADR introduces a separate store.
