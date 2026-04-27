# Plan: Environment Rename

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Decisions/ADRs: `docs/decisions/ADR-026-aggregate-mutation-command-boundary.md`
- Local specs: `docs/workflows/environment-lifecycle.md`,
  `docs/commands/environments.rename.md`, `docs/events/environment-renamed.md`,
  `docs/errors/environments.lifecycle.md`
- Test matrix: `docs/testing/environment-lifecycle-test-matrix.md`

## Architecture Approach

- Domain/application placement: add `Environment.rename(...)` in core and
  `RenameEnvironmentUseCase` in application.
- Repository/specification/visitor impact: reuse `EnvironmentByIdSpec`,
  `EnvironmentByProjectAndNameSpec`, and `UpsertEnvironmentSpec`.
- Event/CQRS/read-model impact: write command records `environment-renamed`; existing
  environment read model observes the persisted name.
- Entrypoint impact: add operation catalog entry, HTTP/oRPC route, CLI subcommand, Web project
  detail affordance, and future MCP coverage through the catalog.
- Persistence/migration impact: none; environment name already exists in persisted state.

## Roadmap And Compatibility

- Roadmap target: Phase 4 `0.6.0` Resource Ownership And CRUD Foundation.
- Version target: next feature line after public `v0.5.0`; `0.6.0` only when all Phase 4 gates pass.
- Compatibility impact: `pre-1.0-policy`, backward-compatible new public command and route.

## Testing Strategy

- Matrix ids: `ENV-LIFE-RENAME-001` through `ENV-LIFE-RENAME-DOCS-001`.
- Test-first rows: core/application rename behavior, catalog, HTTP/oRPC, CLI, Web, docs registry.
- Acceptance/e2e: Web project detail rename dispatch.
- Contract/integration/unit: application use case, operation catalog, HTTP/oRPC dispatch, CLI
  command dispatch, public docs coverage.

## Risks And Migration Gaps

- None for this slice. Environment delete/restore/history remain separate roadmap behaviors.
