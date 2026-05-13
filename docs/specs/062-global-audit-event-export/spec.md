# Global Audit Event Export

## Status

- Round: Code Round / Post-Implementation Sync
- Artifact state: implemented

## Business Outcome

Operators can export a bounded, redacted platform-wide audit slice for incident triage or support
handoff without weakening aggregate-scoped audit export, mutating retention state, or creating legal
hold or immutable archive semantics.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Global audit export | A bounded read-only export of retained audit rows across aggregates. | Operator audit history | platform audit export |
| Export window | Required inclusive/exclusive time range that bounds global export size and replay ambiguity. | Operator audit history | time range |
| Retained audit row | A row in Appaloft-owned audit history that is still visible and delete-blocking until pruned. | Operator audit history | audit log row |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| AUDIT-EVENT-GLOBAL-EXPORT-001 | Time window required | an operator requests global audit export | `from` or `to` is omitted | Appaloft rejects the query with structured validation/scope error and no rows are read. |
| AUDIT-EVENT-GLOBAL-EXPORT-002 | Bounded redacted global export | retained audit rows exist across aggregates in a valid window | export runs | Appaloft returns `audit-events.export-global/v1` metadata, redacted detail rows ordered by time, item count, and truncation status without mutating state. |
| AUDIT-EVENT-GLOBAL-EXPORT-003 | Optional filters narrow rows | retained rows span aggregates and event types | aggregate id or event type filters are supplied | only matching retained rows inside the window are returned. |
| AUDIT-EVENT-GLOBAL-EXPORT-004 | Entrypoints dispatch shared query | CLI or HTTP/oRPC invokes global export | inputs are parsed | adapters dispatch `ExportGlobalAuditEventsQuery` through `QueryBus` using the shared query schema. |

## Domain Ownership

- Bounded context: Operator audit history.
- Aggregate/resource owner: none. Global audit export reads retained audit rows and does not own
  write-side aggregate policy.
- Upstream/downstream contexts: audit row retention and delete safety continue to observe retained
  rows; export does not alter blocker state.

## Public Surfaces

- API: `GET /api/audit-events/export-global`.
- CLI: `appaloft audit-event export-global --from <iso> --to <iso> [--aggregate <aggregateId>] [--event-type <eventType>] [--limit <n>]`.
- Web/UI: future operator maintenance or diagnostics panels may call the same query.
- Config: none in this slice.
- Events: none in this slice.
- Public docs/help: target existing operator audit events anchor until a broader retention page is
  introduced.

## Non-Goals

- Legal holds.
- Immutable archive storage or signed export bundles.
- Organization retention defaults.
- Domain event stream export or retention.
- Outbox/inbox retention.
- Scheduled retention automation.
- Runtime logs, provider job logs, deployment logs, process-attempt journal, remote-state backups,
  runtime artifacts, source workspaces, build cache, route state, resource/server/deployment state,
  dependencies, or storage volume retention.

## Current Implementation Notes And Migration Gaps

- `audit-events.export` remains the aggregate-scoped support export.
- `audit-events.export-global` is implemented as a separate bounded, time-windowed, redacted query
  with application query service, persistence read-model support, CLI and HTTP/oRPC entrypoints,
  operation catalog coverage, public docs/help coverage, and automated tests bound to the matrix
  rows.
- Legal holds, immutable archive storage, organization retention defaults, domain event stream
  retention, and scheduled history retention automation are governed by separate Phase 9 slices.
  ADR-054 defines durable process attempts as the current outbox/inbox-equivalent baseline, so
  accepted background-work retention is covered by `operator-work.prune`; a separate outbox/inbox
  retention command remains not applicable unless a future ADR introduces a separate store.
