# Tasks: Preview Operable Runtime Scope

## Source Of Truth

- [x] PREVIEW-OPS-SPEC-001: add ADR-086 for preview operable runtime scope.
- [x] PREVIEW-OPS-SPEC-001: add feature `spec.md`, `plan.md`, and `tasks.md`.
- [x] PREVIEW-OPS-SPEC-001: update Business Operation Map and Core Operations.
- [x] PREVIEW-OPS-SPEC-001: update product-grade preview, runtime log, terminal, dependency, and MCP docs/help references.

## Test-First

- [x] PREVIEW-OPS-OBS-001/PREVIEW-OPS-OBS-002: add application resolver coverage through affected runtime service tests.
- [x] PREVIEW-OPS-CTRL-001/PREVIEW-OPS-TERM-001: add runtime control and terminal schema/command type coverage.
- [x] PREVIEW-OPS-DEP-001/PREVIEW-OPS-DEP-002: add dependency readback/inspect tests.
- [x] PREVIEW-OPS-QUERY-001/PREVIEW-OPS-QUERY-002: add safe query policy tests.
- [ ] PREVIEW-OPS-MCP-001: add MCP descriptor/schema tests.

## Implementation

- [x] Implement preview operable scope resolver in `packages/application`.
- [x] Batch 1: add preview selectors to logs, health, diagnostics, effective config, and deployment readback operations.
- [x] Batch 2: add preview selectors to runtime control and terminal operations.
- [x] Batch 3: add dependency preview readback, dependency inspect, and safe dependency query contracts.
- [x] Register the Postgres safe-query provider for imported-external and Appaloft-managed resources.
- [ ] Add and register the Redis safe-query provider before reporting Redis query support.

## Entrypoints And Docs

- [x] Add CLI `--preview <previewEnvironmentId>` to supported commands.
- [x] Add HTTP/oRPC schema propagation for preview selectors.
- [x] Ensure generated MCP/tool descriptors expose the same schemas through operation catalog inputs.
- [x] Update public docs/help anchors and Appaloft skill references.

## Verification

- [x] Run targeted application tests for preview scope resolver consumers.
- [x] Run targeted CLI typecheck for preview flags.
- [x] Run targeted oRPC/MCP schema parity through application operation catalog typecheck.
- [x] Run dependency safe query policy tests.
- [x] Run Postgres provider, secret-redaction, and runtime composition tests.

## Post-Implementation Sync

- [x] Reconcile spec, plan, tasks, ADR, operation map, core operations, tests, docs, CLI help, and skill references.
