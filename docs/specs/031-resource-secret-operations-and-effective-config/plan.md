# Plan: Resource Secret Operations And Effective Config Baseline

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Decisions/ADRs: ADR-012, ADR-014, ADR-016, ADR-025, ADR-026, ADR-028
- Local specs: `docs/workflows/resource-profile-lifecycle.md`,
  `docs/commands/resources.set-variable.md`, `docs/commands/resources.unset-variable.md`,
  `docs/queries/resources.effective-config.md`
- Test matrix: `docs/testing/resource-profile-lifecycle-test-matrix.md`

## Architecture Approach

- Domain/application placement: add `resources.import-variables` as an application command under
  the Resource operations slice. The command parses `.env` content, validates all entries, then
  mutates the `Resource` aggregate through existing resource variable behavior.
- Repository/specification/visitor impact: reuse `ResourceRepository`; no new repository or
  persistence table.
- Event/CQRS/read-model impact: command path dispatches through `CommandBus`; effective config
  remains a query path through `QueryBus`. Import publishes existing `resource-variable-set` events
  for imported entries.
- Entrypoint impact: add operation catalog row, CLI command, oRPC route/client contract, and
  contract schemas. Web full import UI is a deferred gap; existing read model/schema supports it.
- Persistence/migration impact: no migration. Existing resource variable persistence stores the
  resource override layer and existing deployment snapshot materialization consumes it.

## Roadmap And Compatibility

- Roadmap target: Phase 7 / `0.9.0` beta, Day-Two Production Controls.
- Version target: `0.9.0` beta, not released in this round.
- Compatibility impact: `pre-1.0-policy`; additive CLI/API/oRPC command and additive effective
  config response fields.

## Testing Strategy

- Matrix ids:
  - `RES-PROFILE-CONFIG-013`
  - `RES-PROFILE-CONFIG-014`
  - `RES-PROFILE-CONFIG-015`
  - `RES-PROFILE-CONFIG-016`
  - `RES-PROFILE-CONFIG-017`
  - `RES-PROFILE-CONFIG-018`
  - `RES-PROFILE-CONFIG-019`
- Test-first rows:
  - application command parser/import and effective override summary tests;
  - CLI dispatch test;
  - HTTP/oRPC dispatch test;
  - operation catalog boundary test.
- Acceptance/e2e: command/query API and CLI dispatch are enough for this baseline; full Web import
  interaction is deferred.
- Contract/integration/unit: application tests cover masking, duplicate/override summaries, and
  build/runtime exposure guards.

## Risks And Migration Gaps

- Risk: import output could leak raw secret values. Mitigation: return masked imported entries and
  metadata only.
- Risk: duplicate values could be confusing. Mitigation: last pasted occurrence wins and response
  reports duplicate line metadata.
- Deferred gap: Web paste/import UI. Existing Web resource configuration read model remains masked
  and can consume the new oRPC command later.
