# Tasks: Audit Event Legal Hold

## Spec Round

- [x] Add ADR-057 and decision index entry.
- [x] Add `docs/specs/063-audit-event-legal-hold/` feature artifacts.
- [x] Add legal hold command/query specs.
- [x] Position legal hold operations in `docs/BUSINESS_OPERATION_MAP.md`.
- [x] Extend `docs/testing/audit-event-read-surface-test-matrix.md` with stable legal hold rows.
- [x] Keep roadmap audit/event retention item open until implementation and verification exist.

## Test-First

- [x] AUDIT-EVENT-HOLD-001: add application and persistence tests for aggregate hold configure.
- [x] AUDIT-EVENT-HOLD-002: add application and persistence tests for bounded global-window hold.
- [x] AUDIT-EVENT-HOLD-003: add hold-aware prune dry-run and destructive tests.
- [x] AUDIT-EVENT-HOLD-004: add list/show safe hold readback tests.
- [x] AUDIT-EVENT-HOLD-005: add release hold tests and prove later prune eligibility.
- [x] AUDIT-EVENT-HOLD-006: add CLI and HTTP/oRPC shared schema dispatch tests.
- [x] Add catalog/docs/OpenAPI/SDK metadata tests for the new operations.

## Implementation

- [x] Add shared legal hold configure/release/list/show schemas.
- [x] Add legal hold command/query messages, handlers, use cases, and query services.
- [x] Add audit legal hold persistence migration and PGlite store/read-model tests.
- [x] Update `audit-events.prune` to skip held rows and report held/skipped counts.
- [x] Add CLI `appaloft audit-event legal-hold ...` commands.
- [x] Add HTTP/oRPC legal hold routes.
- [x] Add operation catalog and public docs registry coverage.
- [x] Add OpenAPI/SDK metadata coverage.

## Entrypoints And Docs

- [x] Add command/query spec links to operation catalog coverage.
- [x] Add public docs/help anchor coverage.
- [x] Keep Web as future operator maintenance surface unless a governed UI slice is in scope.

## Verification

- [x] Run focused application, persistence, CLI, oRPC, openapi, docs-registry, and operation
  catalog tests for audit legal holds.
- [x] Run touched package typecheck and lint.
- [x] Run `git diff --check`.

## Post-Implementation Sync

- [x] Reconcile ADR-057, feature artifacts, audit event matrix, roadmap, operation map, core
  operations, docs/help, code, tests, and remaining migration gaps.
