# Tasks: Audit Event Immutable Archive

## Spec Round

- [x] Add ADR-058 and decision index entry.
- [x] Add `docs/specs/064-audit-event-immutable-archive/` feature artifacts.
- [x] Add archive command/query specs.
- [x] Position archive operations in `docs/BUSINESS_OPERATION_MAP.md`.
- [x] Extend `docs/testing/audit-event-read-surface-test-matrix.md` with stable archive rows.
- [x] Keep roadmap audit/event retention item open until implementation and verification exist.

## Test-First

- [x] AUDIT-EVENT-ARCHIVE-001: add application and persistence tests for aggregate archive create.
- [x] AUDIT-EVENT-ARCHIVE-002: add application and persistence tests for bounded global archive validation.
- [x] AUDIT-EVENT-ARCHIVE-003: add list/show redacted immutable readback and digest stability tests.
- [x] AUDIT-EVENT-ARCHIVE-004: add archive prune dry-run and destructive tests.
- [x] AUDIT-EVENT-ARCHIVE-005: add archive-aware audit prune source-row retention tests.
- [x] AUDIT-EVENT-ARCHIVE-006: add CLI and HTTP/oRPC shared schema dispatch tests.
- [x] Add catalog/docs/OpenAPI/SDK metadata tests for the new operations.

## Implementation

- [x] Add shared archive create/prune/list/show schemas.
- [x] Add archive command/query messages, handlers, use cases, and query services.
- [x] Add audit archive persistence migration and PGlite store/read-model tests.
- [x] Update `audit-events.prune` to skip archive-retained source rows and report archive-retained/skipped counts.
- [x] Add CLI `appaloft audit-event archive ...` commands.
- [x] Add HTTP/oRPC archive routes.
- [x] Add operation catalog and public docs registry coverage.
- [x] Add OpenAPI/SDK metadata coverage.

## Entrypoints And Docs

- [x] Add command/query spec links to operation catalog coverage.
- [x] Add public docs/help anchor coverage.
- [x] Keep Web as future operator maintenance surface unless a governed UI slice is in scope.

## Verification

- [x] Run focused application, persistence, CLI, oRPC, openapi, docs-registry, and operation catalog tests for audit archives.
- [x] Run touched package typecheck and lint.
- [x] Run `git diff --check`.

## Post-Implementation Sync

- [x] Reconcile ADR-058, feature artifacts, audit event matrix, roadmap, operation map, core operations, docs/help, code, tests, and remaining migration gaps.
