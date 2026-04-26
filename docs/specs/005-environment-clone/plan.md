# Plan: Environment Clone

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Operation map: `docs/BUSINESS_OPERATION_MAP.md`
- Public operation catalog source: `docs/CORE_OPERATIONS.md`
- Decisions/ADRs: ADR-012, ADR-013, ADR-026, ADR-030
- Global contracts: `docs/errors/model.md`, `docs/errors/neverthrow-conventions.md`,
  `docs/architecture/async-lifecycle-and-acceptance.md`
- Local specs: `docs/commands/environments.clone.md`,
  `docs/workflows/environment-lifecycle.md`, `docs/errors/environments.lifecycle.md`
- Test matrix: `docs/testing/environment-lifecycle-test-matrix.md`

## Architecture Approach

- Domain/application placement: add a named `cloneTo` operation on the `Environment` aggregate that
  reuses branded environment ids, names, kinds, timestamps, lifecycle status, and configuration
  entries.
- Repository/specification/visitor impact: reuse existing environment repository selection by id
  and by `project + name`; persist the cloned environment through the existing upsert mutation.
- Event/CQRS/read-model impact: add `CloneEnvironmentCommand`, handler, use case, command schema,
  operation catalog entry, and read-model visibility through the existing environment list/show
  paths.
- Entrypoint impact: add CLI subcommand, HTTP/oRPC route/client contract, Web project-detail clone
  control, and public docs/help coverage.
- Admission impact: reject archived source environments and archived source projects before
  persistence.

## Decision State

- Decision state: no new ADR needed
- Governed decisions: ADR-012, ADR-013, ADR-026, ADR-030
- Rationale: clone follows the accepted named aggregate mutation boundary and existing
  project/environment ownership model. It does not introduce a new lifecycle stage, async work,
  provider boundary, durable state shape, or cleanup responsibility.

## Roadmap And Compatibility

- Roadmap target: Phase 4 / `0.6.0` Resource Ownership And CRUD Foundation.
- Version target: next Phase 4-capable release after the current `0.5.x` line.
- Compatibility impact: `pre-1.0-policy`; additive public command/API/CLI/Web capability.
- Release-note requirement: note that active environments can be cloned into new environments.
- Migration requirement: none; clone uses existing environment persistence columns and variable
  rows.

## Testing Strategy

- Matrix ids: `ENV-LIFE-CLONE-*` in `docs/testing/environment-lifecycle-test-matrix.md`.
- Test-first rows:
  - core/application clone success, copied variables, parent source id, and lifecycle status;
  - archived source, duplicate target name, and archived source project rejection;
  - PG/PGlite clone persistence round trip;
  - HTTP/oRPC dispatch;
  - CLI dispatch;
  - Web project-detail clone dispatch;
  - operation catalog/docs registry coverage.

## Risks And Migration Gaps

- Risk: clone could be confused with promotion. Mitigation: docs and command naming state that clone
  copies configuration only and creates no deployment/release semantics.
- Risk: secret values could leak in UI/tests/docs. Mitigation: reuse existing config value masking
  rules and assert only masked metadata at public/read boundaries.
- Migration gaps: none planned for this behavior.
