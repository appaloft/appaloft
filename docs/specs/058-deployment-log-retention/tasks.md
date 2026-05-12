# Tasks: Deployment Log Retention

## Test-First

- [x] DEP-LOG-PRUNE-001: add application dry-run/default test.
- [x] DEP-LOG-PRUNE-002: add application destructive prune test.
- [x] DEP-LOG-PRUNE-003: add PGlite cutoff/scope/writeback test.
- [x] DEP-LOG-PRUNE-004: add CLI and oRPC dispatch tests.

## Source Of Truth

- [x] Add ADR-052 and decision index entry.
- [x] Add `docs/commands/deployments.logs.prune.md`.
- [x] Add deployment log retention feature spec, plan, and tasks.
- [x] Add deployment log retention test matrix.
- [x] Update operation map, core operations, roadmap, docs registry.

## Implementation

- [x] Add application command, handler, use case, port types, tokens, exports, and operation catalog
  entry.
- [x] Add PG deployment log retention store.
- [x] Add contracts/oRPC/CLI entrypoints.

## Entrypoints And Docs

- [x] Wire CLI help to the deployment/runtime observability help topic.
- [x] Add oRPC route `POST /api/deployments/logs/prune`.
- [x] Keep Web as future surface.

## Verification

- [x] Run focused application, persistence, CLI, oRPC, and docs-registry tests.
- [x] Run typecheck for touched packages.
- [x] Run lint for touched packages.

## Post-Implementation Sync

- [x] Reconcile spec, plan, tasks, durable docs, tests, and code.
