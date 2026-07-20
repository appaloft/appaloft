# Plan: Preview Operable Runtime Scope

## Governing Sources

- Domain model: [DOMAIN_MODEL.md](../../DOMAIN_MODEL.md)
- Operation map: [BUSINESS_OPERATION_MAP.md](../../BUSINESS_OPERATION_MAP.md)
- Decisions/ADRs: [ADR-086](../../decisions/ADR-086-preview-operable-runtime-scope.md),
  [ADR-018](../../decisions/ADR-018-resource-runtime-log-observation.md),
  [ADR-020](../../decisions/ADR-020-resource-health-observation.md),
  [ADR-022](../../decisions/ADR-022-operator-terminal-session-boundary.md),
  [ADR-038](../../decisions/ADR-038-resource-runtime-control-ownership.md),
  [ADR-040](../../decisions/ADR-040-dependency-binding-runtime-injection-boundary.md),
  [ADR-080](../../decisions/ADR-080-appaloft-as-mcp-transport-boundary.md)
- Local specs: [spec.md](./spec.md)
- Test matrix: [Preview Operable Runtime Scope Test Matrix](../../testing/preview-operable-runtime-scope-test-matrix.md)

## Architecture Approach

- Add a preview operable scope resolver in `packages/application` that reads
  `PreviewEnvironmentReadModel` and returns parent Resource, Environment, Project, server,
  destination, preview status, source, and optional deployment context.
- Extend only service/runtime-scoped operation schemas with `previewEnvironmentId`.
- Keep existing operation keys; do not create `preview.logs`, `preview.restart`, or preview-only
  MCP tools.
- Batch 1 resolves read-only logs, health, diagnostics, effective config, and deployment readback.
- Batch 2 resolves runtime control and terminal sessions.
- Batch 3 adds dependency binding preview readback plus accepted dependency inspect/query
  operation contracts and restrictive adapter policies.

## Roadmap And Compatibility

- Roadmap target: `0.12.x` repository/config/preview hardening.
- Version target: pre-1.0 development line.
- Compatibility impact: `pre-1.0-policy`, additive input fields and CLI flags.

## Testing Strategy

- Matrix ids: `PREVIEW-OPS-*`.
- Application tests prove resolver validation and no fallback to non-preview runtime context.
- CLI tests prove `--preview` maps to existing commands/queries.
- Operation catalog / MCP tests prove descriptors use shared schemas and read-only annotations.
- Adapter policy tests prove Postgres and Redis safe query constraints before provider execution.

## Risks And Migration Gaps

- Existing preview read models may not always carry a deployment id; first implementation must fail
  closed for deployment-specific operations when the preview deployment cannot be resolved safely.
- Web operational tabs can land after CLI/API/MCP parity if Svelte placement requires a larger UI
  pass, but the oRPC contract must be ready first.
- Postgres safe dependency query is exposed only when its provider adapter is registered and reports
  support for the selected resource. Redis remains fail-closed and must not report support until its
  provider adapter and composition proof land.
