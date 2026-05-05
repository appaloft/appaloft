# Plan: Postgres Provider-Native Realization

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Operation map: `docs/BUSINESS_OPERATION_MAP.md`
- Core operations: `docs/CORE_OPERATIONS.md`
- Global contracts: `docs/errors/model.md`, `docs/errors/neverthrow-conventions.md`,
  `docs/architecture/async-lifecycle-and-acceptance.md`
- Decisions: ADR-012, ADR-014, ADR-016, ADR-025, ADR-026, ADR-028
- Workflow spec: `docs/workflows/dependency-resource-lifecycle.md`
- Test matrix: `docs/testing/dependency-resource-test-matrix.md`

## Architecture Approach

- Core:
  - Extend `ResourceInstance` with provider-native realization value objects and transitions.
  - Keep provider handles and realization status as explicit value objects, not primitive fields in
    aggregate state.
  - Add delete admission behavior that distinguishes imported-external record deletion from
    Appaloft-managed provider cleanup.
- Application:
  - Add provider capability ports for managed Postgres create/delete/observe with safe DTOs.
  - Upgrade `ProvisionPostgresDependencyResourceUseCase` to persist realization state and call or
    schedule the provider capability.
  - Upgrade bind admission to require ready realized state for Appaloft-managed Postgres.
  - Upgrade delete to request provider cleanup only after safety readers report no blockers.
- Persistence/read models:
  - Persist safe realization status, attempt id, provider handle, timestamps, and sanitized failure
    metadata.
  - Extend list/show and binding read models without exposing provider SDK or secret material.
- Entrypoints:
  - Reuse existing CLI/oRPC/HTTP operations unless Code Round requires additive input fields.
  - Operation catalog remains the single transport source of truth.

## Roadmap And Compatibility

- Roadmap target: Phase 7 / `0.9.0` beta.
- Version target: not releasing in this round.
- Compatibility impact: `pre-1.0-policy`, semantic upgrade to managed Postgres behavior.
- Release-note/changelog: deferred until release prep.

## Testing Strategy

- Matrix ids:
  - DEP-RES-PG-NATIVE-001
  - DEP-RES-PG-NATIVE-002
  - DEP-RES-PG-NATIVE-003
  - DEP-RES-PG-NATIVE-004
  - DEP-RES-PG-NATIVE-005
  - DEP-RES-PG-NATIVE-006
  - DEP-RES-PG-NATIVE-007
  - DEP-RES-PG-NATIVE-008
- Test-first bindings:
  - Core tests for realization transitions, failure state, binding readiness, and delete admission.
  - Application use-case tests with a fake managed Postgres provider port.
  - Persistence PGlite tests for realization state and safe read models.
  - CLI/oRPC/HTTP route dispatch tests if input/output schemas change.
  - Operation catalog boundary tests for schema reuse and no generic operation.

## Risks And Migration Gaps

- Durable process/outbox ownership is still incomplete globally. This Code Round uses a synchronous
  hermetic provider adapter while preserving the durable attempt/status contract.
- Backup/restore remains a separate Phase 7 slice; this work only preserves blockers and safe
  metadata needed by that loop.
- Runtime environment injection remains deferred; binding readiness does not mean a running
  workload has received a database URL.
- Web/public documentation affordances remain a migration gap unless completed in the same PR.
