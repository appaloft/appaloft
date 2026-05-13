# Tasks: Runtime Artifact And Workspace Prune

## Test-First

- [x] RT-CAP-PRUNE-001: add application dry-run/default test.
- [x] RT-CAP-PRUNE-002: add application destructive prune test.
- [x] RT-CAP-PRUNE-003: add runtime adapter skip reason parser test.
- [x] RT-CAP-PRUNE-005: add CLI and oRPC dispatch tests.
- [x] RT-CAP-PRUNE-006: add destructive prune audit output tests.
- [x] RT-CAP-PRUNE-007: add explicit Docker build-cache and unused-image category tests.

## Source Of Truth

- [x] Add ADR-047 and decision index entry.
- [x] Add ADR-050 and decision index entry for Docker build-cache and unused-image prune.
- [x] Add `docs/commands/servers.capacity.prune.md`.
- [x] Update operation map, core operations, runtime workflow, implementation plan, roadmap, docs registry.

## Implementation

- [x] Add application command, handler, use case, port types, tokens, exports, and operation catalog entry.
- [x] Add runtime adapter prune implementation for local-shell and generic-SSH.
- [x] Extend runtime adapter prune implementation for explicit Docker build-cache and unused-image
  categories.
- [x] Add contracts/oRPC/CLI entrypoints.
- [x] Add audit recorder port, persistence implementation, and destructive prune audit wiring.

## Entrypoints And Docs

- [x] Wire CLI help to `diagnostics.runtime-target-capacity`.
- [x] Add oRPC route `POST /api/servers/{serverId}/capacity/prune`.
- [x] Keep Web as future surface.

## Verification

- [x] Run focused application, runtime adapter, CLI, oRPC, and docs-registry tests.
- [x] Run typecheck for touched packages.
- [x] Run lint for touched packages.
- [x] Re-run focused application, persistence, runtime adapter, CLI, oRPC, docs-registry tests and
  touched package typecheck/lint after audit output wiring.

## Post-Implementation Sync

- [x] Reconcile spec, plan, tasks, durable docs, tests, and code after audit output wiring.
