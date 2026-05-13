# Tasks: Global Audit Event Export

## Spec Round

- [x] Add ADR-056 and decision index entry.
- [x] Add `docs/specs/062-global-audit-event-export/` feature artifacts.
- [x] Add `docs/queries/audit-events.export-global.md`.
- [x] Position `audit-events.export-global` in `docs/BUSINESS_OPERATION_MAP.md`.
- [x] Extend `docs/testing/audit-event-read-surface-test-matrix.md` with stable global export rows.
- [x] Keep roadmap audit/event retention item open until implementation and verification exist.

## Test-First

- [x] AUDIT-EVENT-GLOBAL-EXPORT-001: add application validation test for required `from` and `to`.
- [x] AUDIT-EVENT-GLOBAL-EXPORT-002: add persistence-backed redacted bounded global export test.
- [x] AUDIT-EVENT-GLOBAL-EXPORT-003: add aggregate and event type filter tests.
- [x] AUDIT-EVENT-GLOBAL-EXPORT-004: add CLI and HTTP/oRPC shared query dispatch tests.
- [x] Add catalog/docs/OpenAPI/SDK metadata tests for the new operation.

## Implementation

- [x] Add shared `ExportGlobalAuditEventsQueryInput` schema.
- [x] Add `ExportGlobalAuditEventsQuery`, handler, and query service.
- [x] Add audit event read-model export method for bounded global reads.
- [x] Add CLI `appaloft audit-event export-global` command.
- [x] Add HTTP/oRPC `GET /api/audit-events/export-global` route.
- [x] Add operation catalog and public docs registry coverage.
- [x] Add OpenAPI/SDK metadata coverage.

## Entrypoints And Docs

- [x] Add query spec links to operation catalog coverage.
- [x] Add public docs/help anchor coverage.
- [x] Keep Web as future operator maintenance or diagnostics surface unless a governed UI slice is
  in scope.

## Verification

- [x] Run focused application, persistence, CLI, oRPC, openapi, docs-registry, and operation
  catalog tests for audit events.
- [x] Run touched package typecheck and lint.
- [x] Run `git diff --check`.

## Post-Implementation Sync

- [x] Reconcile ADR-056, feature artifacts, audit event matrix, roadmap, operation map, core
  operations, docs/help, code, tests, and remaining migration gaps.
