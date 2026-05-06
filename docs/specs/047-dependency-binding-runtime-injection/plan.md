# Dependency Binding Runtime Injection Plan

## Scope

Implement runtime delivery for active ready dependency bindings during `deployments.create` without
adding dependency-specific deployment input fields.

## Source Of Truth

- [ADR-040](../../decisions/ADR-040-dependency-binding-runtime-injection-boundary.md)
- [Dependency Binding Runtime Injection Spec](./spec.md)
- [Dependency Resource Lifecycle](../../workflows/dependency-resource-lifecycle.md)
- [Dependency Resource Test Matrix](../../testing/dependency-resource-test-matrix.md)
- [deployments.create Test Matrix](../../testing/deployments.create-test-matrix.md)
- [ADR-012](../../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-023](../../decisions/ADR-023-runtime-orchestration-target-boundary.md)

## Code Shape

1. Add an application-layer dependency runtime-injection materializer under
   `packages/application/src/operations/deployments/`.
2. Feed the materializer with active `ResourceDependencyBindingSummary` records, the effective
   environment snapshot, and selected runtime target backend capability data.
3. Keep materialization out of core aggregates except for immutable value objects/state already
   needed by `Deployment`.
4. Extend `DeploymentDependencyBindingSnapshotSummary.runtimeInjection` from only `deferred` to
   `ready | blocked | deferred` in application ports and public contracts.
5. Extend `deployments.plan`, `deployments.create`, and `deployments.show` to report consistent
   safe runtime injection readiness.
6. Extend runtime target backends to advertise and verify dependency secret delivery support before
   deployment acceptance.
7. Keep single-server and Swarm runtime command rendering redacted when dependency secrets are
   resolved or mounted.

## Package Impact

| Package | Planned impact |
| --- | --- |
| `packages/core` | Add value objects/state only if existing dependency binding reference state cannot represent captured runtime injection facts safely. |
| `packages/application` | Materializer, plan/create/show readiness, ports/contracts mapping, tests. |
| `packages/contracts` | Runtime injection readiness schema accepts `ready`, `blocked`, and `deferred`; no raw secret fields. |
| `packages/persistence/pg` | Persist any new deployment snapshot fields if core state expands. |
| `packages/adapters/runtime` | Runtime target capability and redacted secret delivery for single-server and Swarm paths. |
| `packages/adapters/cli`, `packages/orpc`, `apps/web` | Reuse shared schemas/readiness fields; no parallel input shapes. |
| `apps/docs` | Public docs anchor explaining bind -> deploy behavior and blocked readiness. |

## Test Strategy

- Application tests for Postgres and imported Redis runtime injection admission.
- Plan-preview tests for ready and blocked runtime injection states.
- Contract tests for `deployments.plan`, `deployments.show`, and dependency binding summaries.
- PGlite persistence tests if deployment snapshot shape expands.
- Runtime adapter tests for single-server and Swarm redaction and capability gating.
- Public docs/help link test after Docs Round.

## Release Impact

- Roadmap target: Phase 7 / `0.9.0` beta.
- Compatibility impact: `pre-1.0-policy`; additive readiness fields plus stricter deployment
  admission when active bindings cannot be injected safely.
- Release note: mention that bound Postgres/imported Redis dependencies are delivered to workloads
  through runtime environment variables once the Code Round lands.

## Deferred

- Managed Redis binding and runtime injection.
- Build-time dependency injection.
- File/reference injection modes.
- Provider-native credential rotation.
- Backend-native secret-store integrations beyond the first single-server and Swarm delivery path.
