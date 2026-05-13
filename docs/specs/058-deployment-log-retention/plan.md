# Plan: Deployment Log Retention

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Decisions/ADRs: ADR-052
- Local specs: `docs/commands/deployments.logs.prune.md`
- Test matrix: `docs/testing/deployment-log-retention-test-matrix.md`

## Architecture Approach

- Domain/application placement: command schema, command, handler, and use case in
  `packages/application`.
- Persistence impact: add a deployment-log retention store in `packages/persistence/pg` that
  rewrites only the `deployments.logs` JSON value for affected rows.
- Event/CQRS/read-model impact: command mutation through `CommandBus`; `deployments.logs` remains a
  query.
- Entrypoint impact: CLI and oRPC use the same command schema.
- Migration impact: no schema change; embedded log entries already contain timestamps.

## Roadmap And Compatibility

- Roadmap target: Phase 9 operator state closure for `0.11.0`.
- Version target: pre-1.0 policy; additive public command.
- Compatibility impact: additive CLI/API response schema; destructive deletion requires explicit
  `dryRun = false`.

## Testing Strategy

- Matrix ids: `DEP-LOG-PRUNE-001` through `DEP-LOG-PRUNE-004`.
- Test-first rows: application use case, PG/PGlite embedded-log pruning, CLI dispatch, oRPC route.
- Acceptance/e2e: CLI/oRPC dispatch shared command schema.
- Contract/integration/unit: application command schema and persistence cutoff/scope tests.

## Risks And Migration Gaps

- Embedded log pruning changes deployment detail/read logs output. The command remains dry-run by
  default and returns counts only.
- Runtime log archival is not covered because runtime logs are resource-owned observation through
  runtime target adapters.
- Legal hold and organization retention defaults are not modeled yet.
