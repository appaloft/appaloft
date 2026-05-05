# Plan: Dependency Binding Secret Rotation

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Operation map: `docs/BUSINESS_OPERATION_MAP.md`
- Local specs:
  - `docs/commands/resources.rotate-dependency-binding-secret.md`
  - `docs/events/resource-dependency-binding-secret-rotated.md`
  - `docs/workflows/dependency-resource-lifecycle.md`
  - `docs/specs/034-dependency-resource-binding-baseline/spec.md`
  - `docs/specs/035-dependency-binding-snapshot-reference-baseline/spec.md`
- Test matrix: `docs/testing/dependency-resource-test-matrix.md`
- Decisions/ADRs:
  - ADR-012 Resource Runtime Profile And Deployment Snapshot Boundary
  - ADR-014 Deployment Admission Uses Resource Profile
  - ADR-025 Control-Plane Modes And Action Execution
  - ADR-026 Aggregate Mutation Command Boundary
  - ADR-028 Command Coordination Scope And Mutation Admission

## Architecture Approach

- Domain/application placement:
  - Add `ResourceBinding` value objects for safe binding secret reference/version metadata.
  - Add a `rotateSecret(...)` aggregate operation that rejects removed bindings and records
    `resource-dependency-binding-secret-rotated`.
  - Add `RotateResourceDependencyBindingSecretCommand`, schema, handler, and use case under
    `packages/application/src/operations/resources`.
- Repository/specification/visitor impact:
  - Extend ResourceBinding repository persistence with safe secret reference/version columns.
  - Keep selection by ResourceBinding id and owner Resource id.
  - Do not add provider/database methods to ResourceBinding repositories.
- Event/CQRS/read-model impact:
  - Command mutates ResourceBinding only.
  - Event publication happens after ResourceBinding persistence and is consumed by read-model/audit
    projectors only in this slice.
  - Existing list/show query services expose safe rotation metadata.
  - Deployment snapshots remain immutable and continue to copy only safe references at admission.
- Entrypoint impact:
  - Add CLI, oRPC, and HTTP routes that dispatch through the command bus and reuse the application
    schema.
  - Do not expose a generic dependency update operation.
- Persistence/migration impact:
  - Add nullable safe secret reference/version metadata for existing bindings.
  - Existing bindings read as not yet rotated or as using their original safe reference.
  - No raw secret columns.

## Roadmap And Compatibility

- Roadmap target: Phase 7 / `0.9.0` beta.
- Version target: `0.9.0` only after all Phase 7 required items and exit criteria are checked.
- Compatibility impact: `pre-1.0-policy`, additive public CLI/API/oRPC operation.
- Release note/migration requirement: mention as a Phase 7 additive capability when implemented.

## Testing Strategy

- Matrix ids:
  - DEP-BIND-ROTATE-001
  - DEP-BIND-ROTATE-002
  - DEP-BIND-ROTATE-003
  - DEP-BIND-ROTATE-004
  - DEP-BIND-ROTATE-005
  - DEP-BIND-ROTATE-006
- Test-first rows:
  - Core ResourceBinding rotation behavior and removed-binding rejection.
  - Application command admission, persistence, event, and no-provider-runtime side effects.
  - Read-model masking and rotation metadata.
  - Deployment snapshot immutability after rotation.
  - Operation catalog, CLI, and HTTP/oRPC dispatch.
- Acceptance/e2e:
  - CLI and HTTP/oRPC route dispatch tests are sufficient for this backend-core slice.
  - Web is deferred until a Docs/Web round.
- Contract/integration/unit:
  - Core unit, application integration, PG/PGlite persistence, contracts if response schemas add
    fields, CLI and oRPC tests.

## Risks And Migration Gaps

- Provider-native credential rotation remains a separate future provider/database lifecycle slice.
- Runtime env injection remains deferred; rotation only changes future safe references.
- Existing deployment snapshots must never be rewritten to point at the new secret version.
- Web affordances and public docs are deferred until the command is implemented.
