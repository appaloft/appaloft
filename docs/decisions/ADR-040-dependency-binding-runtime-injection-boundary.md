# ADR-040: Dependency Binding Runtime Injection Boundary

Status: Accepted

Date: 2026-05-06

## Decision

Resource dependency bindings become runtime inputs only through deployment admission and runtime
target adapters. Operators must not pass database URLs, Redis URLs, provider credentials, or
dependency-specific environment fields to `deployments.create`.

The accepted boundary is:

```text
ResourceBinding + DependencyResource
  -> deployments.plan readiness
  -> deployments.create immutable dependency injection snapshot
  -> runtime target adapter secret delivery
```

`ResourceBinding` owns the current association between a Resource and a Dependency Resource.
`Deployment` owns the immutable dependency injection snapshot for one attempt. Runtime target
adapters own provider-specific materialization of that snapshot into Docker environment variables,
Docker secrets, Compose environment, Swarm secrets, or later backend-native secret mechanisms.

Deployment admission must materialize only active, ready, injectable bindings. For the Phase 7 Code
Round:

- supported dependency kinds are `postgres` and imported external `redis`;
- supported binding scope is `runtime-only`;
- supported injection mode is `env`;
- `targetName` is the runtime environment variable name, for example `DATABASE_URL` or `REDIS_URL`;
- raw secret values must never be stored in Deployment snapshots, read models, logs, events, errors,
  runtime plan summaries, or public contracts;
- the deployment snapshot stores safe binding identity and secret-reference metadata only;
- the runtime target adapter resolves or mounts the secret as close to execution as possible.

If an active binding cannot be injected safely, `deployments.plan` reports a blocked runtime
injection readiness and `deployments.create` rejects before accepting the deployment. This is a
change from the earlier safe-reference-only slice where runtime injection was diagnostic and
deferred.

## Context

Phase 7 already has Dependency Resources, ResourceBindings, safe deployment snapshot references,
binding secret rotation, dependency backup/restore, and runtime target abstraction. The remaining
Postgres and Redis release loops are blocked because a bound dependency is visible in deployment
snapshots but not delivered to the deployed workload.

Existing environment snapshots already carry runtime variables into single-server and Swarm
execution. Dependency bindings need stricter semantics because their values are secret references
or provider-managed handles, not plain configuration values.

## Consequences

- `deployments.create` remains ids-only and does not accept dependency-specific input fields.
- `deployments.plan`, `deployments.create`, and `deployments.show` must agree on runtime injection
  readiness and the immutable binding snapshot captured for an attempt.
- Retry and rollback use the captured injection snapshot from the source attempt or selected
  rollback candidate; they must not silently switch to the current ResourceBinding state.
- Binding secret rotation changes only future deployments. Historical deployment snapshots and
  rollback candidates keep the captured binding/secret reference.
- Managed Redis remains blocked until provider-native Redis realization supplies a safe connection
  secret reference and readiness contract.
- Future file/reference injection modes, build-time dependency injection, provider credential
  rotation, and backend-native secret stores require explicit specs before implementation.

## Implementation Requirements

- Application code must build a dedicated dependency runtime-injection materializer instead of
  assembling environment variables inline inside `CreateDeploymentUseCase`.
- Materialization must validate duplicate target names against effective environment/resource
  variables before acceptance. Dependency binding targets must not silently override operator-set
  variables.
- Runtime adapters must redact raw resolved secrets in command display, logs, events, errors, and
  diagnostics.
- Read models may show binding id, dependency resource id, dependency kind, target name, injection
  mode, scope, and readiness. They must not show raw secret values.

## References

- [Dependency Binding Runtime Injection](../specs/047-dependency-binding-runtime-injection/spec.md)
- [Dependency Resource Lifecycle](../workflows/dependency-resource-lifecycle.md)
- [Dependency Resource Test Matrix](../testing/dependency-resource-test-matrix.md)
- [deployments.create Test Matrix](../testing/deployments.create-test-matrix.md)
- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](./ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-023: Runtime Orchestration Target Boundary](./ADR-023-runtime-orchestration-target-boundary.md)
- [ADR-036: Dependency Resource Backup And Restore Lifecycle](./ADR-036-dependency-resource-backup-restore-lifecycle.md)
