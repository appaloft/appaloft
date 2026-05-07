# Plan: Redis Provider-Native Realization

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Operation map: `docs/BUSINESS_OPERATION_MAP.md`
- Core operations: `docs/CORE_OPERATIONS.md`
- Global contracts: `docs/errors/model.md`, `docs/errors/neverthrow-conventions.md`,
  `docs/architecture/async-lifecycle-and-acceptance.md`
- Decisions: ADR-012, ADR-014, ADR-016, ADR-025, ADR-026, ADR-028, ADR-036, ADR-040, ADR-041
- Local specs: `docs/specs/037-redis-dependency-resource-lifecycle/spec.md`,
  `docs/specs/047-dependency-binding-runtime-injection/spec.md`,
  `docs/specs/048-dependency-runtime-secret-value-resolution/spec.md`
- Workflow spec: `docs/workflows/dependency-resource-lifecycle.md`
- Test matrix: `docs/testing/dependency-resource-test-matrix.md`

## Architecture Approach

- Core:
  - Reuse `ResourceInstance` provider-native realization state shape for Redis where it is generic.
  - Add or extend value objects only when Redis needs distinct endpoint/TLS/database-index
    invariants.
  - Keep provider handles, realization status, safe failure metadata, and Redis connection
    references as explicit value objects in aggregate state.
- Application:
  - Add managed Redis provider capability ports or extend a generic dependency realization port
    without exposing provider SDK types.
  - Upgrade `ProvisionRedisDependencyResourceUseCase` to persist realization state and request the
    provider capability.
  - Store Appaloft-owned Redis connection values through `DependencyResourceSecretStore` before
    marking binding readiness ready.
  - Upgrade bind admission to allow realized ready managed Redis and continue to block unresolved
    connection refs.
  - Upgrade delete to request provider cleanup only after binding, backup, snapshot/reference, and
    provider safety checks pass.
- Persistence/read models:
  - Persist safe Redis realization status, attempt id, provider handle, endpoint metadata,
    connection secret ref, timestamps, and sanitized failure metadata.
  - Extend list/show and binding read models without exposing provider SDK response bodies or raw
    Redis connection material.
- Entrypoints:
  - Reuse existing Redis provision, dependency delete, and bind commands unless Code Round requires
    additive non-secret input fields.
  - Keep operation catalog as the single transport source of truth.
- Events:
  - Reuse dependency resource realization events; consumers resolve kind through dependency
    resource state unless a Code Round explicitly extends the event payload safely.

## Roadmap And Compatibility

- Roadmap target: Phase 7 / `0.9.0` beta.
- Version target: not releasing in this round.
- Compatibility impact: `pre-1.0-policy`, semantic upgrade to managed Redis behavior.
- Affected public surfaces: CLI, oRPC/HTTP, read-model contracts, public docs/help, future MCP
  generated operation descriptors.
- Release-note/changelog: deferred until release prep.

## Testing Strategy

- Matrix ids:
  - DEP-RES-REDIS-NATIVE-001
  - DEP-RES-REDIS-NATIVE-002
  - DEP-RES-REDIS-NATIVE-003
  - DEP-RES-REDIS-NATIVE-004
  - DEP-RES-REDIS-NATIVE-005
  - DEP-RES-REDIS-NATIVE-006
  - DEP-RES-REDIS-NATIVE-007
  - DEP-RES-REDIS-NATIVE-008
  - DEP-RES-REDIS-NATIVE-009
- Test-first bindings:
  - Core tests for Redis realization transitions, safe failure state, binding readiness, and delete
    admission.
  - Application use-case tests with a fake managed Redis provider capability.
  - Application binding tests for realized ready managed Redis and blocked unresolved refs.
  - Runtime injection tests proving realized managed Redis can flow to `REDIS_URL` through existing
    single-server and Swarm resolver paths.
  - PGlite persistence tests for Redis realization state and safe read models.
  - Contract/CLI/oRPC tests if schemas, route behavior, or output fields change.

## Risks And Migration Gaps

- Durable outbox/process ownership remains a platform migration gap. The first Code Round may use
  a synchronous hermetic provider adapter if it preserves durable attempt/status semantics.
- Real provider onboarding and smoke tests may remain release enablement work after the safe
  provider capability contract is implemented.
- Provider-native Redis credential rotation is explicitly outside this behavior.
- Web affordances remain a migration gap unless the Code Round includes a Docs/Web slice.
- This behavior is necessary for the Redis closed-loop exit criterion, but the roadmap should not
  check that criterion until managed Redis provision, bind, deploy, observe, and backup/restore or
  delete are verified together.
