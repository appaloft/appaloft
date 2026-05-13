# Plan: Provider Job Log Retention

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Decisions/ADRs: ADR-049, ADR-048, ADR-018, ADR-029
- Local specs: `docs/commands/provider-job-logs.prune.md`
- Test matrix: `docs/testing/provider-job-log-retention-test-matrix.md`

## Architecture Approach

- Domain/application placement: command schema, command, handler, and use case live in
  `packages/application`; the use case delegates retention counting/deletion to an injected
  `ProviderJobLogRetentionStore` port.
- Repository/specification/visitor impact: no core aggregate repository impact; persistence adapter
  translates optional deployment/provider/resource/server filters to `provider_job_logs` plus
  deployment joins.
- Event/CQRS/read-model impact: command-side retention mutation through `CommandBus`; no query
  mutation, event publication, outbox/inbox, or deployment-log mutation.
- Entrypoint impact: CLI and oRPC use the command schema directly; Web remains future.
- Persistence/migration impact: no new table; use existing `provider_job_logs`.

## Roadmap And Compatibility

- Roadmap target: Phase 9 operator state closure for `0.11.0`.
- Version target: pre-1.0 policy; additive public CLI/API capability.
- Compatibility impact: additive command and response schema; destructive behavior requires
  explicit `dryRun = false`.

## Testing Strategy

- Matrix ids: `PROV-JOB-LOG-PRUNE-001` through `PROV-JOB-LOG-PRUNE-004`.
- Test-first rows: application use case and command schema, persistence/PGlite retention store, CLI
  dispatch, oRPC route, docs registry operation coverage.
- Contract/integration/unit: PGlite tests prove dry-run/delete/cutoff/scope safety and that
  deployment rows remain retained while provider job log rows are pruned.

## Risks And Migration Gaps

- This slice does not add provider job log writers or export/readback surfaces.
- Deployment logs, resource runtime log archive snapshots, legal holds, and organization retention
  defaults are governed by separate implemented Phase 9 retention slices.
- Live runtime log observation and external provider log stores remain outside this provider job log
  retention boundary.
