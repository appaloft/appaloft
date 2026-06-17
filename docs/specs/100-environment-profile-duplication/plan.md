# Plan: Environment Profile Duplication

## Governing Sources

- Decision: [ADR-085](../../decisions/ADR-085-environment-profile-duplication-boundary.md)
- Current operations: [Core Operations: Environments](../../CORE_OPERATIONS.md#environments)
- Current concepts:
  - [Environment model](../../../apps/docs/src/content/docs/environments/model.md)
  - [Variable precedence and snapshots](../../../apps/docs/src/content/docs/environments/variables/precedence.md)
  - [Diff and promote environments](../../../apps/docs/src/content/docs/environments/changes/diff-promote.md)
- Related specs:
  - [Repository Config Named Profile Overlays](../084-repository-config-named-profile-overlays/spec.md)
  - [Repository Config Service Graph](../096-repository-config-service-graph/spec.md)
  - [Repository Config Application Graph](../097-repository-config-application-graph/spec.md)
  - [Storage Volume Resource Visibility](../096-storage-volume-resource-visibility/spec.md)
- Test matrix: [Environment Profile Duplication Test Matrix](../../testing/environment-profile-duplication-test-matrix.md)

## Architecture Approach

- Domain/application placement:
  - keep `Environment` as lifecycle/config boundary;
  - introduce profile planning/application services that read Environment, Resource, Dependency
    Resource, Domain Binding, Storage Volume, preview policy, and repository-config-derived
    profile views;
  - apply decisions by dispatching intention-revealing commands instead of mutating repositories
    directly.
- Repository/specification/visitor impact:
  - add read-side profile collectors rather than making Environment repositories join every child
    aggregate by default;
  - add selection specs for source environment resources and target environment profile readiness
    when Code Round begins.
- Event/CQRS/read-model impact:
  - `plan-duplicate` and `diff-profile` are queries with masked read models;
  - `duplicate-profile` and `sync-profile` are commands that may orchestrate several child
    commands;
  - process-state/read models should expose pending decisions and deployment blockers.
- Entrypoint impact:
  - API/CLI/Web/tool surfaces must reuse shared operation schemas once operations are introduced;
  - UI must be staged and decision-first.
- Persistence/migration impact:
  - Phase 1 can compute plans on demand;
  - Phase 2 starts as a synchronous apply command that dispatches existing child commands and
    returns deferred decisions;
  - unresolved environment profile decisions are persisted/projected as deployment blockers;
  - later phases may persist accepted plans, decision journals beyond pending blockers, and
    idempotency keys if provider-backed apply becomes long-running.

## Roadmap And Compatibility

- Roadmap target: environment capability expansion after product-grade preview baseline.
- Version target: minor capability addition.
- Compatibility impact:
  - additive planned operations;
  - existing `environments.clone` semantics remain variable-only until a deprecation/migration
    decision is accepted.

## Testing Strategy

- Matrix ids: `ENV-PROFILE-DUP-*`.
- Test-first rows:
  - plan masks secrets and classifies source-specific values;
  - dependency decisions create new, bind existing, reuse source with acknowledgement, or defer;
  - deferred decisions block deployment admission;
  - diff/sync masks secrets and preserves target-only decisions.
  - preview policy can select a base Environment Profile while fork/secret safety, ids-only
    deployment admission, and preview-owned cleanup remain intact.
- Acceptance/e2e:
  - API/CLI route parity after operation catalog entries exist;
  - Web staged workflow after UI implementation starts.
- Contract/integration/unit:
  - domain value-object and planner unit tests;
  - application service tests with fake repositories/command bus;
  - oRPC/CLI contract tests.

## Risks And Migration Gaps

- Existing `environments.diff` must not leak secret values before profile diff is user-facing.
- Dependency and storage data decisions may require additional public neutral ports before hosted or
  self-hosted provider adapters can provide managed-provider behavior.
- UI copy must make shared-source production dependency use permanently visible.
- Long-running apply may need durable work state before provider-backed dependency provisioning is
  enabled.
