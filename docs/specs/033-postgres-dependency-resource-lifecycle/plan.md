# Plan: Postgres Dependency Resource Lifecycle

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Operation map: `docs/BUSINESS_OPERATION_MAP.md`
- Core operations: `docs/CORE_OPERATIONS.md`
- Decisions/ADRs: ADR-012, ADR-014, ADR-016, ADR-025, ADR-026, ADR-028
- Global contracts: `docs/errors/model.md`, `docs/errors/neverthrow-conventions.md`,
  `docs/architecture/async-lifecycle-and-acceptance.md`
- Workflow spec: `docs/workflows/dependency-resource-lifecycle.md`
- Test matrix: `docs/testing/dependency-resource-test-matrix.md`

## Architecture Approach

- Domain/application placement:
  - Extend `packages/core/src/dependency-resources` around `ResourceInstance`.
  - Add value objects for dependency resource name/slug/source/connection exposure/masked
    connection metadata as needed.
  - Add application vertical slices under `packages/application/src/operations/dependency-resources`.
- Repository/specification/visitor impact:
  - Add `ResourceInstance` selection/mutation specs.
  - Add one repository/read-model port for dependency resources.
  - Add PG/PGlite repository/read model under `packages/persistence/pg`.
- Event/CQRS/read-model impact:
  - Commands mutate only `ResourceInstance`.
  - Queries return safe dependency resource summaries/details.
  - No async provider events or integration events in this slice.
- Entrypoint impact:
  - Add operation catalog entries.
  - Add CLI and oRPC/HTTP dispatch routes reusing command/query schemas.
  - Web write/read UI remains deferred.
- Persistence/migration impact:
  - Add `dependency_resources` table with JSON fields only for provider-neutral metadata,
    masked connection summary, connection secret ref, exposure policy, backup relationship, and
    delete-safety placeholder metadata.

## Roadmap And Compatibility

- Roadmap target: Phase 7 / `0.9.0` beta.
- Version target: not releasing in this round.
- Compatibility impact: `pre-1.0-policy`, additive public CLI/API/oRPC operations and read-model
  schema.
- Release-note/changelog: deferred until an actual release prep round.

## Testing Strategy

- Matrix ids:
  - DEP-RES-PG-PROVISION-001
  - DEP-RES-PG-IMPORT-001
  - DEP-RES-PG-VALIDATION-001
  - DEP-RES-PG-READ-001
  - DEP-RES-PG-READ-002
  - DEP-RES-PG-RENAME-001
  - DEP-RES-PG-DELETE-001
  - DEP-RES-PG-DELETE-002
  - DEP-RES-PG-DELETE-003
  - DEP-RES-PG-DELETE-004
  - DEP-RES-PG-ENTRY-001
  - DEP-RES-PG-ENTRY-002
- Test-first rows:
  - core aggregate tests for create/import/validation/delete blockers;
  - application use-case/query tests for provision/import/list/show/rename/delete;
  - operation catalog boundary test;
  - CLI dispatch tests;
  - oRPC/HTTP route dispatch tests;
  - PG/PGlite persistence/read-model test if schema changes.

## Risks And Migration Gaps

- Provider-native Postgres provisioning/deletion remains deferred; managed resources are blocked
  from unsafe delete by default.
- Deployment snapshots do not include dependency binding secrets in this slice.
- Public docs page/help anchor is a Docs Round migration gap unless expanded in this PR.
- Future bind/unbind must replace placeholder readiness/blocker readers with concrete binding
  persistence and snapshot materialization rules.
