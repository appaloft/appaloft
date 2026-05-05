# Plan: Dependency Resource Binding Baseline

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Operation map: `docs/BUSINESS_OPERATION_MAP.md`
- Core operations: `docs/CORE_OPERATIONS.md`
- Decisions/ADRs: ADR-012, ADR-014, ADR-016, ADR-025, ADR-026, ADR-028
- Global contracts: `docs/errors/model.md`, `docs/errors/neverthrow-conventions.md`,
  `docs/architecture/async-lifecycle-and-acceptance.md`
- Workflow spec: `docs/workflows/dependency-resource-lifecycle.md`
- Test matrix: `docs/testing/dependency-resource-test-matrix.md`
- Baseline dependency spec: `docs/specs/033-postgres-dependency-resource-lifecycle/spec.md`

## Architecture Approach

- Domain/application placement:
  - Extend `packages/core/src/dependency-resources/ResourceBinding`.
  - Keep binding as an independent association aggregate with value-object references to Resource
    and Dependency Resource identities.
  - Add binding target value objects for variable/profile labels and active/tombstoned status.
  - Add application vertical slices under `packages/application/src/operations/resources` because
    the public operation is Resource-scoped.
- Repository/specification/visitor impact:
  - Add ResourceBinding selection/mutation specs and a repository/read-model port.
  - Add PG/PGlite persistence table for binding metadata only.
  - Replace dependency resource delete-safety placeholder with a real active binding count/query.
- Event/CQRS/read-model impact:
  - Commands mutate `ResourceBinding`.
  - Queries return safe Resource dependency binding read models.
  - No async provider events or integration events in this slice.
- Entrypoint impact:
  - Add operation catalog entries.
  - Add CLI and oRPC/HTTP dispatch routes reusing command/query schemas.
  - Web read/write UI remains deferred.
- Persistence/migration impact:
  - Add a `resource_dependency_bindings` table with no raw secret columns.
  - Store only references, target metadata, lifecycle status, and timestamps.

## Roadmap And Compatibility

- Roadmap target: Phase 7 / `0.9.0` beta.
- Version target: not releasing in this round.
- Compatibility impact: `pre-1.0-policy`, additive public CLI/API/oRPC operations and read-model
  schema.
- Release-note/changelog: deferred until an actual release prep round.

## Testing Strategy

- Matrix ids:
  - DEP-BIND-PG-BIND-001
  - DEP-BIND-PG-BIND-002
  - DEP-BIND-PG-BIND-003
  - DEP-BIND-PG-BIND-004
  - DEP-BIND-PG-READ-001
  - DEP-BIND-PG-READ-002
  - DEP-BIND-PG-UNBIND-001
  - DEP-BIND-PG-DELETE-001
  - DEP-BIND-PG-DELETE-002
  - DEP-BIND-PG-ENTRY-001
  - DEP-BIND-PG-SNAPSHOT-001
- Test-first rows:
  - core aggregate tests for bind validation, duplicate target, unbind, and emitted events;
  - application use-case/query tests for bind/unbind/list/show/delete blocker behavior;
  - operation catalog boundary test;
  - CLI dispatch tests;
  - oRPC/HTTP route dispatch tests;
  - PG/PGlite persistence/read-model/delete-safety tests.

## Risks And Migration Gaps

- Deployment snapshots do not include dependency bindings or secrets in this slice; read models
  report snapshot materialization as deferred.
- Runtime env injection remains deferred.
- Secret rotation remains deferred.
- Backup/restore remains deferred.
- Resource delete/archive binding blockers may remain a deferred gap if not implemented in the
  first binding slice.
- Public docs page/help anchor is a Docs Round migration gap unless expanded in this PR.
