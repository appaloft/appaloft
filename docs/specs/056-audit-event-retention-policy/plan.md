# Plan: Audit Event Retention Policy

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Decisions/ADRs: ADR-048
- Local specs: `docs/queries/audit-events.list.md`, `docs/queries/audit-events.show.md`,
  `docs/commands/audit-events.prune.md`
- Test matrix: `docs/testing/audit-event-read-surface-test-matrix.md`

## Architecture Approach

- Domain/application placement: command schema, command, handler, and use case in
  `packages/application`.
- Repository/specification/visitor impact: extend the audit event persistence boundary with a
  prune method over retained audit rows; no aggregate repository is involved.
- Event/CQRS/read-model impact: command mutation through `CommandBus`; list/show remain queries.
- Entrypoint impact: CLI and oRPC use the same command schema.
- Persistence/migration impact: no schema change; `audit_logs.created_at` is sufficient for the
  first cutoff-based retention command.

## Roadmap And Compatibility

- Roadmap target: Phase 9 operator state closure for `0.11.0`.
- Version target: pre-1.0 policy; additive public command.
- Compatibility impact: additive CLI/API response schema; destructive deletion requires explicit
  `dryRun = false`.

## Testing Strategy

- Matrix ids: `AUDIT-EVENT-PRUNE-001` through `AUDIT-EVENT-PRUNE-004`.
- Test-first rows: application use case, PG/PGlite prune behavior, CLI dispatch, oRPC route.
- Acceptance/e2e: CLI/oRPC dispatch shared command schema.
- Contract/integration/unit: application command schema and persistence cutoff/scope tests.

## Risks And Migration Gaps

- Global audit prune without aggregate scope can remove history broadly; this first slice mitigates
  by requiring explicit `before` and dry-run default.
- Domain event stream retention is now governed by ADR-059 and implemented through the separate
  `domain-events.prune` slice.
- ADR-057 legal hold semantics are implemented in the separate audit legal hold slice; active holds
  guard `audit-events.prune` without changing this command's dry-run-first boundary.
- ADR-054 defines durable process attempts as the current outbox/inbox-equivalent baseline, so
  accepted background-work retention is covered by `operator-work.prune`; a separate outbox/inbox
  retention command remains not applicable unless a future ADR introduces a separate store.
