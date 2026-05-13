# Audit Event Read Surface Test Matrix

## Normative Contract

Audit event read surfaces let operators inspect retained audit history without exposing sensitive
payload fields or mutating retention/recovery state. List/show and aggregate export remain
aggregate-scoped; global export is a separate bounded, time-windowed query. Legal holds and
immutable archives are separate retention guard/snapshot surfaces and must not be treated as ad hoc
exports.

## Global References

- [audit-events.list](../queries/audit-events.list.md)
- [audit-events.show](../queries/audit-events.show.md)
- [audit-events.export](../queries/audit-events.export.md)
- [audit-events.export-global](../queries/audit-events.export-global.md)
- [audit-events.archives.create](../commands/audit-events.archives.create.md)
- [audit-events.archives.prune](../commands/audit-events.archives.prune.md)
- [audit-events.archives.list](../queries/audit-events.archives.list.md)
- [audit-events.archives.show](../queries/audit-events.archives.show.md)
- [Error Model](../errors/model.md)
- [Adapter Command/Query Boundary](../architecture/adapter-command-query-boundary.md)

## Matrix

| Test ID | Layer | Case | Expected result |
| --- | --- | --- | --- |
| AUDIT-EVENT-CATALOG-001 | catalog | Active operation catalog entries | `audit-events.list` and `audit-events.show` expose CLI and HTTP/oRPC transports and shared schemas. |
| AUDIT-EVENT-QRY-001 | application | Aggregate scope required | List/show without aggregate scope return `audit_event_scope_required`. |
| AUDIT-EVENT-QRY-002 | application | Show missing event | Show with unmatched `auditEventId + aggregateId` returns `audit_event_not_found`. |
| AUDIT-EVENT-PG-001 | persistence/pg | List retained events | PG read model lists audit summaries by aggregate id, event type, limit, and cursor. |
| AUDIT-EVENT-PG-002 | persistence/pg | Detail redaction | PG read model returns primitive safe payload values and masks sensitive or nested payload fields. |
| AUDIT-EVENT-ENTRY-001 | CLI | CLI dispatch | `appaloft audit-event list/show` dispatch shared audit event queries. |
| AUDIT-EVENT-ENTRY-002 | HTTP/oRPC | HTTP dispatch | HTTP routes dispatch shared query schemas and return v1 response shapes. |
| AUDIT-EVENT-DOCS-001 | docs | Public docs registry coverage | Both operation keys map to the audit events help topic. |
| AUDIT-EVENT-PRUNE-001 | application | Dry-run default | `audit-events.prune` counts old retained audit rows without deleting by default. |
| AUDIT-EVENT-PRUNE-002 | application | Destructive prune | `audit-events.prune` with `dryRun = false` deletes only matching old audit rows and returns counts by event type. |
| AUDIT-EVENT-PRUNE-003 | persistence/pg | Cutoff and scope safety | PG prune retains cutoff-equal, newer, and out-of-scope rows. |
| AUDIT-EVENT-PRUNE-004 | CLI + HTTP/oRPC | Prune entrypoint dispatch | CLI and HTTP/oRPC dispatch `PruneAuditEventsCommand` through the shared schema. |
| AUDIT-EVENT-EXPORT-001 | application | Scope and metadata | `audit-events.export` requires aggregate scope and returns `audit-events.export/v1` metadata with effective filters. |
| AUDIT-EVENT-EXPORT-002 | persistence/pg | Redacted bounded export | PG export returns redacted details, honors event/time filters, and reports truncation when more rows match. |
| AUDIT-EVENT-EXPORT-003 | CLI + HTTP/oRPC | Export entrypoint dispatch | CLI and HTTP/oRPC dispatch `ExportAuditEventsQuery` through the shared schema. |
| AUDIT-EVENT-GLOBAL-EXPORT-001 | application | Time window required | `audit-events.export-global` rejects missing `from` or `to` with structured validation or scope error. |
| AUDIT-EVENT-GLOBAL-EXPORT-002 | persistence/pg | Redacted bounded global export | PG global export returns redacted details across aggregates, orders rows deterministically, and reports truncation when more rows match. |
| AUDIT-EVENT-GLOBAL-EXPORT-003 | persistence/pg | Optional global export filters | PG global export honors aggregate id, event type, and exclusive `to` filters inside the required window. |
| AUDIT-EVENT-GLOBAL-EXPORT-004 | CLI + HTTP/oRPC | Global export entrypoint dispatch | CLI and HTTP/oRPC dispatch `ExportGlobalAuditEventsQuery` through the shared schema. |
| AUDIT-EVENT-HOLD-001 | application + persistence/pg | Configure aggregate hold | `audit-events.legal-holds.configure` records an active aggregate-scoped hold with reason and safe metadata. |
| AUDIT-EVENT-HOLD-002 | application + persistence/pg | Configure bounded global hold | `audit-events.legal-holds.configure` records an active global-window hold only when `from < to` and a reason is supplied. |
| AUDIT-EVENT-HOLD-003 | application + persistence/pg | Prune skips held rows | `audit-events.prune` dry-runs and destructively deletes only unheld matching rows, returning held/skipped counts for rows matched by active holds. |
| AUDIT-EVENT-HOLD-004 | application + persistence/pg | Legal hold readback | `audit-events.legal-holds.list/show` return safe hold scope, status, reason, and release metadata without audit payloads. |
| AUDIT-EVENT-HOLD-005 | application + persistence/pg | Release hold | `audit-events.legal-holds.release` marks a hold released, keeps history readable, and lets later prune delete matching rows when no active hold remains. |
| AUDIT-EVENT-HOLD-006 | CLI + HTTP/oRPC | Legal hold entrypoint dispatch | CLI and HTTP/oRPC dispatch legal hold configure/list/show/release messages through shared schemas. |
| AUDIT-EVENT-ARCHIVE-001 | application + persistence/pg | Create aggregate archive | `audit-events.archives.create` records an immutable aggregate-scoped redacted archive snapshot with source filters, reason, item count, generated time, and digest metadata. |
| AUDIT-EVENT-ARCHIVE-002 | application + persistence/pg | Create bounded global archive | `audit-events.archives.create` records a global-window archive only when `from < to` and a reason is supplied. |
| AUDIT-EVENT-ARCHIVE-003 | application + persistence/pg | Archive readback | `audit-events.archives.list/show` return safe archive metadata, digest, source-row reference retention status, and stored redacted rows without raw payloads or regenerating content from source rows. |
| AUDIT-EVENT-ARCHIVE-004 | application + persistence/pg | Archive prune dry-run first | `audit-events.archives.prune` defaults to dry-run and destructively deletes only old matching archive records and items when `dryRun = false`. |
| AUDIT-EVENT-ARCHIVE-005 | application + persistence/pg | Audit prune skips archive-retained source rows | `audit-events.prune` counts and skips old source audit rows referenced by retained archives with source-row reference retention. |
| AUDIT-EVENT-ARCHIVE-006 | CLI + HTTP/oRPC | Archive entrypoint dispatch | CLI and HTTP/oRPC dispatch archive create/list/show/prune messages through shared schemas. |

## Current Implementation Notes

This slice reads, exports, and prunes the existing `audit_logs` table through persistence/pg.
Global audit export is implemented as a separate bounded query. Legal holds are implemented as
retention guard records with safe readback and release commands; `audit-events.prune` skips rows
matched by active holds and reports held counts. Immutable archive storage is governed by ADR-058
and `docs/specs/064-audit-event-immutable-archive`, with retained redacted snapshot, digest,
archive prune, and archive-aware audit prune bindings in this matrix. Domain event stream retention
is governed separately by ADR-059 and `docs/testing/domain-event-stream-retention-test-matrix.md`.
ADR-054 defines durable process attempts as the current outbox/inbox-equivalent process state; that
retention is governed separately by `operator-work.prune`.
