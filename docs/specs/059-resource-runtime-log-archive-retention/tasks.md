# Tasks: Resource Runtime Log Archive Retention

## Test-First

- [x] RUNTIME-LOG-ARCHIVE-001: add application archive-capture test with a fake runtime log reader.
- [x] RUNTIME-LOG-ARCHIVE-002: add archive list/show readback tests that prove redacted output.
- [x] RUNTIME-LOG-ARCHIVE-003: add dry-run prune test.
- [x] RUNTIME-LOG-ARCHIVE-004: add PG/PGlite destructive prune cutoff/scope test.
- [x] RUNTIME-LOG-ARCHIVE-005: add resource/server delete-safety blocker tests.
- [x] RUNTIME-LOG-ARCHIVE-006: add CLI and oRPC dispatch tests once entrypoints are active.

## Source Of Truth

- [x] Add ADR-053 and decision index entry.
- [x] Add `docs/specs/059-resource-runtime-log-archive-retention/` feature artifacts.
- [x] Add runtime log archive retention test matrix.
- [x] Position active operations in the business operation map and Core Operations notes.

## Implementation

- [x] Add application commands/queries, handlers, use cases/query services, schemas, ports, tokens,
  and operation catalog entries.
- [x] Add archive snapshot persistence/read-model implementation.
- [x] Add resource/server delete-safety reader integration for retained archive snapshots.

## Entrypoints And Docs

- [x] Add CLI commands for archive/list/show/prune.
- [x] Add HTTP/oRPC routes and contract response schemas.
- [x] Update SDK/OpenAPI generation metadata through operation catalog/oRPC route metadata.
- [x] Update public runtime log observability docs/help anchors.
- [x] Keep Web as future unless the operator maintenance surface is in scope.

## Verification

- [x] Run focused application, PG, CLI, oRPC, docs-registry, and typecheck checks.
- [x] Run lint checks.

## Post-Implementation Sync

- [x] Reconcile spec, plan, tasks, durable docs, tests, public docs, operation catalog, and code.
