# Tasks: Sandbox Agent Runtime And Application Promotion

## Source Of Truth

- [x] Accept ADR-092 and Spec 109.
- [x] Update Domain Model, Business Operation Map, Core Operations and local command/query/event/error/workflow specs.
- [x] Add stable test matrix rows and automated bindings.

## Slice 1: Sandbox Agent Runtime

- [x] Add Runtime/Run/approval value objects, aggregates and domain tests.
- [x] Add harness-neutral ports, fake harness and Pi adapter.
- [x] Add tenant-scoped persistence for Runtime, Run, events and approvals.
- [x] Add command/query handlers, bounded event readback and cancellation.
- [x] Add operation catalog, HTTP/oRPC, SDK, CLI and catalog-derived MCP surfaces.

## Slice 2: Source Artifact And Candidate Preview

- [x] Add SourceArtifact aggregate, safe manifest capture and ArtifactStore port/adapters.
- [x] Add candidate preview provider, expiry/revoke and exact-digest verification.
- [x] Add persistence, operations, readback and exact cleanup.

## Slice 3: Sandbox Promotion

- [x] Add plan/accept/retry aggregate and durable workflow.
- [x] Compose new Resource, zip-artifact source binding, first Deployment and proof query.
- [x] Add idempotent partial-failure recovery and Delivery Evidence Chain readback.
- [x] Add complete transport parity and acceptance test.

## Slice 4: Public Narrative

- [x] Apply ADR-093 to README and public docs IA with truthful maturity labels.
- [x] Add runnable Agent SDK quickstart for the private-preview contract.
- [x] Keep private-preview/available claims synchronized with tests.

## Verification And Sync

- [x] Run core/application/persistence/adapter/transport/SDK/CLI/catalog-derived MCP suites.
- [x] Run CLI parsing and generated SDK against the real HTTP/oRPC mount.
- [x] Update matrix status only after named tests pass.
- [x] Complete Post-Implementation Sync and public commit/PR handoff ([PR #774](https://github.com/appaloft/appaloft/pull/774)).
