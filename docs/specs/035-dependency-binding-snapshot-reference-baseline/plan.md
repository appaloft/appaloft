# Plan: Dependency Binding Deployment Snapshot Reference Baseline

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Operation map: `docs/BUSINESS_OPERATION_MAP.md`
- Core operations: `docs/CORE_OPERATIONS.md`
- Decisions/ADRs: ADR-012, ADR-014, ADR-016, ADR-025, ADR-026, ADR-028
- Global contracts: `docs/errors/model.md`, `docs/errors/neverthrow-conventions.md`,
  `docs/architecture/async-lifecycle-and-acceptance.md`
- Workflow specs:
  - `docs/workflows/dependency-resource-lifecycle.md`
  - `docs/workflows/deployments.create.md`
- Query specs:
  - `docs/queries/deployments.plan.md`
  - `docs/queries/deployments.show.md`
- Test matrices:
  - `docs/testing/dependency-resource-test-matrix.md`
  - `docs/testing/deployments.create-test-matrix.md`
  - `docs/testing/deployment-plan-preview-test-matrix.md`
  - `docs/testing/deployments.show-test-matrix.md`
- Baseline binding spec: `docs/specs/034-dependency-resource-binding-baseline/spec.md`

## Architecture Approach

- Domain/application placement:
  - Add provider-neutral dependency binding snapshot reference value objects in
    `packages/core/src/release-orchestration`.
  - Extend `Deployment` state with immutable dependency binding references.
  - Keep `ResourceBinding` as the current binding aggregate; do not move binding lifecycle into
    `Deployment` or `Resource`.
- Repository/specification/visitor impact:
  - Read active binding summaries from the existing `ResourceDependencyBindingReadModel`.
  - Persist copied safe references with Deployment attempts.
  - Do not persist raw connection secrets or materialized env values.
- Event/CQRS/read-model impact:
  - `deployments.create` remains the only general deployment admission command.
  - `deployments.plan` remains a read-only query with no side effects.
  - `deployments.show` returns immutable attempt snapshot context.
  - No new public operation or operation catalog entry is required.
- Entrypoint impact:
  - Existing deployment plan/show schemas add optional safe summary fields.
  - CLI/API/oRPC keep existing operation keys and command/query dispatch.
  - Web UI changes are not required for the first slice.
- Persistence/migration impact:
  - Add a provider-neutral JSON column or equivalent persisted shape for deployment dependency
    binding references.
  - Existing deployment rows default to an empty reference list.

## Roadmap And Compatibility

- Roadmap target: Phase 7 / `0.9.0` beta.
- Version target: not releasing in this round.
- Compatibility impact: `pre-1.0-policy`, additive deployment snapshot/read-model schema.
- Release-note/changelog: deferred until an actual release prep round.

## Testing Strategy

- Matrix ids:
  - DEP-BIND-SNAP-REF-001
  - DEP-BIND-SNAP-REF-002
  - DEP-BIND-SNAP-REF-003
  - DEP-BIND-SNAP-REF-004
  - DEP-BIND-SNAP-REF-005
  - DEP-BIND-SNAP-REF-006
- Test-first rows:
  - core Deployment snapshot reference test;
  - application `deployments.create` test proving active safe references are captured;
  - application `deployments.plan` test proving readiness summary and no side effects;
  - application `deployments.show` test proving immutable snapshot summary;
  - PG/PGlite deployment persistence/read-model test when schema changes;
  - contract/schema tests for plan/show response shape if contracts change.

## Risks And Migration Gaps

- Runtime env injection remains deferred and must not be inferred from snapshot readiness.
- Secret rotation remains deferred.
- Backup/restore remains deferred.
- Redis remains deferred.
- Existing deployments have no dependency binding references and should read as an empty list, not
  as missing/corrupt state.
- Public docs page/help anchor is a Docs Round migration gap unless expanded in this PR.
