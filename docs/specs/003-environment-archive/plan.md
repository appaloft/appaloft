# Plan: Environment Archive

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Operation map: `docs/BUSINESS_OPERATION_MAP.md`
- Public operation catalog source: `docs/CORE_OPERATIONS.md`
- Decisions/ADRs: ADR-012, ADR-013, ADR-026, ADR-030
- Global contracts: `docs/errors/model.md`, `docs/errors/neverthrow-conventions.md`,
  `docs/architecture/async-lifecycle-and-acceptance.md`
- Local specs: `docs/commands/environments.archive.md`,
  `docs/workflows/environment-lifecycle.md`, `docs/events/environment-archived.md`,
  `docs/errors/environments.lifecycle.md`
- Test matrix: `docs/testing/environment-lifecycle-test-matrix.md`

## Architecture Approach

- Domain/application placement: add lifecycle state to the `Environment` aggregate using branded
  value objects, an idempotent `archive` method, and `ensureCanAcceptMutation` guards.
- Repository/specification/visitor impact: extend environment state serialization with lifecycle
  status, archive timestamp, and optional reason; add a PG/PGlite migration.
- Event/CQRS/read-model impact: add `ArchiveEnvironmentCommand`, handler, use case, command schema,
  operation catalog entry, and `environment-archived` event publication on first transition.
- Entrypoint impact: add CLI subcommand, HTTP/oRPC route/client contract, Web project-detail
  environment archive action, and public docs/help coverage.
- Admission impact: guard environment config writes, environment promotion, resource creation, and
  deployment context/bootstrap admission when an archived environment is selected.

## Decision State

- Decision state: no new ADR needed
- Governed decisions: ADR-012, ADR-013, ADR-026, ADR-030
- Rationale: archive follows the accepted named aggregate mutation boundary and the existing
  project/resource lifecycle model. It does not introduce a new ownership boundary, async lifecycle,
  or deployment execution stage.

## Roadmap And Compatibility

- Roadmap target: Phase 4 / `0.6.0` Resource Ownership And CRUD Foundation.
- Version target: next Phase 4-capable release after the current `0.5.x` line.
- Compatibility impact: `pre-1.0-policy`; new public command/API/CLI/Web capability and additive
  read-model fields.
- Release-note requirement: note that environments can now be archived and remain readable.
- Migration requirement: add environment lifecycle columns with active defaults.

## Testing Strategy

- Matrix ids: `ENV-LIFE-*` in `docs/testing/environment-lifecycle-test-matrix.md`.
- Test-first rows:
  - core aggregate archive/idempotency/guard behavior;
  - application archive use case, read model metadata, set/unset/promote/resource/deployment
    guards;
  - PG/PGlite persistence round trip;
  - HTTP/oRPC dispatch;
  - CLI dispatch;
  - Web project-detail archive dispatch;
  - operation catalog/docs registry coverage.

## Risks And Migration Gaps

- Risk: archive could be confused with cleanup. Mitigation: command/event/docs state that archive is
  retention-only and cleanup uses separate future commands.
- Risk: deployment bootstrap could create default resources before rejection. Mitigation: bootstrap
  guards archived environments before default/configured resource creation.
- Migration gaps: none planned for this behavior.
