# Plan: Redis Dependency Resource Lifecycle

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Operation map: `docs/BUSINESS_OPERATION_MAP.md`
- Local specs:
  - `docs/commands/dependency-resources.provision-redis.md`
  - `docs/commands/dependency-resources.import-redis.md`
  - `docs/workflows/dependency-resource-lifecycle.md`
  - `docs/specs/033-postgres-dependency-resource-lifecycle/spec.md`
- Test matrix: `docs/testing/dependency-resource-test-matrix.md`
- Decisions/ADRs:
  - ADR-012 Resource Runtime Profile And Deployment Snapshot Boundary
  - ADR-014 Deployment Admission Uses Resource Profile
  - ADR-025 Control-Plane Modes And Action Execution
  - ADR-026 Aggregate Mutation Command Boundary
  - ADR-028 Command Coordination Scope And Mutation Admission

## Architecture Approach

- Domain/application placement:
  - Extend the dependency resource model with Redis endpoint value objects and a
    `ResourceInstance.createRedisDependencyResource(...)` factory.
  - Add `ProvisionRedisDependencyResourceCommand` and `ImportRedisDependencyResourceCommand`.
  - Keep `dependency-resources.list/show/rename/delete` generic and extend their input/output
    schemas from `postgres` to `postgres | redis`.
- Repository/read-model impact:
  - Extend persistence schema/read model endpoint payloads to represent Redis endpoint metadata.
  - Preserve Postgres rows without migration-time shape changes.
  - Keep one ResourceInstance repository; do not add Redis-specific repositories.
- Secret/masking impact:
  - Add Redis connection parsing/masking for `redis://`, `rediss://`, and endpoint-plus-secret
    input.
  - Store only safe secret references and masked connection display in read models.
- Entrypoint impact:
  - Add CLI `dependency redis provision/import`.
  - Add oRPC/HTTP provision/import routes.
  - Reuse existing dependency list/show/rename/delete entrypoints.
- Runtime/provider impact:
  - Do not call provider-native Redis APIs.
  - Do not inject runtime env or mutate deployments.

## Roadmap And Compatibility

- Roadmap target: Phase 7 / `0.9.0` beta.
- Version target: `0.9.0` only after all Phase 7 required items and exit criteria are checked.
- Compatibility impact: `pre-1.0-policy`, additive public CLI/API/oRPC operations and output kind.
- Release note/migration requirement: mention Redis dependency resource baseline when implemented.

## Testing Strategy

- Matrix ids:
  - DEP-RES-REDIS-PROVISION-001
  - DEP-RES-REDIS-IMPORT-001
  - DEP-RES-REDIS-VALIDATION-001
  - DEP-RES-REDIS-READ-001
  - DEP-RES-REDIS-READ-002
  - DEP-RES-REDIS-RENAME-001
  - DEP-RES-REDIS-DELETE-001
  - DEP-RES-REDIS-DELETE-002
  - DEP-RES-REDIS-ENTRY-001
- Test-first rows:
  - Core ResourceInstance Redis creation/import validation.
  - Application provision/import/list/show/rename/delete behavior.
  - Read-model masking for secret-bearing Redis URI and ACL inputs.
  - PG/PGlite persistence and read model round trip.
  - Operation catalog, CLI, and HTTP/oRPC dispatch.
- Contract/integration/unit:
  - Core unit tests, application integration tests, PG/PGlite tests, contracts, CLI and oRPC tests.

## Risks And Migration Gaps

- Runtime env injection remains deferred; Redis records are safe control-plane resources only.
- Provider-native Redis creation/deletion remains deferred.
- Redis binding semantics may need additional target defaults and readiness checks later.
- Backup/restore remains metadata-only until a future backup lifecycle slice.
