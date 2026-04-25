# Plan: Environment Effective Precedence

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Operation map: `docs/BUSINESS_OPERATION_MAP.md`
- Public operation catalog source: `docs/CORE_OPERATIONS.md`
- Decisions/ADRs: ADR-012, ADR-026, ADR-030
- Global contracts: `docs/errors/model.md`, `docs/errors/neverthrow-conventions.md`,
  `docs/architecture/async-lifecycle-and-acceptance.md`
- Local specs: `docs/queries/environments.effective-precedence.md`
- Test matrix: `docs/testing/environment-effective-precedence-test-matrix.md`

## Architecture Approach

- Domain/application placement: add read-only query `environments.effective-precedence` under the
  environment operation slice. The query loads the `Environment` aggregate and calls its existing
  snapshot materialization behavior.
- Repository/specification/visitor impact: no new persistence visitor or schema migration. The
  existing `EnvironmentRepository.findOne(EnvironmentByIdSpec)` is sufficient.
- Event/CQRS/read-model impact: query only. It returns a read model and does not publish events or
  mutate aggregate state.
- Entrypoint impact: add operation catalog row, CLI subcommand, HTTP/oRPC route/client contract, and
  public docs coverage. Transports reuse the query input schema.
- Persistence/migration impact: none.

## Decision State

- Decision state: no new ADR needed
- Governed decisions: ADR-012, ADR-026, ADR-030
- Rationale: this is a read query over existing `Environment` and `EnvironmentConfigSet` semantics.
  It does not change aggregate ownership, lifecycle stages, durable state shape, async acceptance,
  canonical language, or write command boundaries.

## Roadmap And Compatibility

- Roadmap target: Phase 4 / `0.6.0` Resource Ownership And CRUD Foundation.
- Version target: next Phase 4-capable release after the current `0.5.x` line.
- Compatibility impact: `pre-1.0-policy`; new public query/API/CLI capability, no breaking input or
  output removal.
- Release-note requirement: note that environments can now be inspected for effective precedence.
- Migration requirement: none.

## Testing Strategy

- Matrix ids: `ENV-PRECEDENCE-QRY-001` through `ENV-PRECEDENCE-QRY-003` and
  `ENV-PRECEDENCE-ENTRY-001` through `ENV-PRECEDENCE-ENTRY-003`.
- Test-first rows:
  - application query service precedence and masking;
  - application missing environment error;
  - HTTP/oRPC dispatch;
  - CLI dispatch;
  - operation catalog/docs registry coverage.
- Contract/integration/unit:
  - application tests cover query semantics through repositories;
  - oRPC and CLI tests prove entrypoint dispatch through shared query message;
  - docs-registry and operation-catalog tests cover public catalog parity.

## Risks And Migration Gaps

- Risk: users may confuse environment effective precedence with resource effective configuration.
  Mitigation: output names and public docs distinguish environment-owned effective entries from
  resource-level overrides.
- Risk: the existing environment variable schema allows several config scopes. Mitigation: the query
  exposes the stable precedence order and returns the winning scope explicitly.
- Migration gaps: none planned for this behavior.
