# Tasks: Audit Event Retention Policy

## Test-First

- [x] AUDIT-EVENT-PRUNE-001: add application dry-run/default test.
- [x] AUDIT-EVENT-PRUNE-002: add application destructive prune test.
- [x] AUDIT-EVENT-PRUNE-003: add PG/PGlite cutoff and scope retention test.
- [x] AUDIT-EVENT-PRUNE-004: add CLI and oRPC dispatch tests.

## Source Of Truth

- [x] Add ADR-048 and decision index entry.
- [x] Add `docs/commands/audit-events.prune.md`.
- [x] Update operation map, core operations, audit matrix, roadmap, docs registry.

## Implementation

- [x] Add application command, handler, use case, port types, tokens, exports, and operation catalog entry.
- [x] Add PG audit prune implementation.
- [x] Add contracts/oRPC/CLI entrypoints.

## Entrypoints And Docs

- [x] Wire CLI help to `operator.audit-events`.
- [x] Add oRPC route `POST /api/audit-events/prune`.
- [x] Keep Web as future surface.

## Verification

- [x] Run focused application, PG, CLI, oRPC, and docs-registry tests.
- [x] Run typecheck for touched packages.
- [x] Run lint for touched packages.

## Post-Implementation Sync

- [x] Reconcile spec, plan, tasks, durable docs, tests, and code.
