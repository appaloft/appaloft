# resources.bind-dependency Command Spec

## Metadata

- Operation key: `resources.bind-dependency`
- Command class: `BindResourceDependencyCommand`
- Input schema: `BindResourceDependencyCommandInput`
- Handler: `BindResourceDependencyCommandHandler`
- Use case: `BindResourceDependencyUseCase`
- Domain / bounded context: Dependency Resources / Resource binding
- Current status: active Phase 7 Code Round

## Purpose

Bind a ready Postgres Dependency Resource, ready imported Redis Dependency Resource, or realized
ready Appaloft-managed Redis Dependency Resource to an active Resource with safe target exposure
metadata for future deployment snapshot materialization and runtime injection.

## Input Model

| Field | Required | Domain meaning |
| --- | --- | --- |
| `resourceId` | Yes | Resource receiving the dependency binding. |
| `dependencyResourceId` | Yes | Dependency Resource being bound. |
| `targetName` | Yes | Safe variable/profile label for the binding target, for example `DATABASE_URL` or `REDIS_URL`. |
| `scope` | No | Binding scope; defaults to `runtime-only` in this slice. |
| `injectionMode` | No | Binding injection mode; defaults to `env` in this slice. |

## Branches

| Branch | Condition | Behavior | Result |
| --- | --- | --- | --- |
| Bind | Active Resource and ready bindable Dependency Resource share project/environment | Persist active ResourceBinding. | `ok({ id })` |
| Managed Postgres not realized | Appaloft-managed Postgres realization is pending, failed, unsupported, or deleted | Reject before mutation. | `resource_dependency_binding_blocked` or structured lifecycle/conflict error |
| Managed Redis not realized | Appaloft-managed Redis realization is pending, failed, unsupported, deleted, or has an unresolved Appaloft-owned connection ref | Reject before mutation. | `resource_dependency_binding_blocked` |
| Cross context | Resource and Dependency Resource differ by project/environment | Reject before mutation. | `resource_dependency_binding_context_mismatch` |
| Duplicate target | Same active Resource/Dependency/target policy exists | Reject before mutation. | `conflict`, `phase = resource-dependency-binding` |
| Inactive participant | Resource or Dependency Resource is missing, archived, deleted, or not bindable | Reject before mutation. | `not_found`, lifecycle error, or validation error |
| Unsafe target | Target variable/profile label is invalid or secret-bearing output is requested | Reject before mutation. | `validation_error`, `phase = resource-dependency-binding` |

## Events

| Event | Type | Publisher | Required? |
| --- | --- | --- | --- |
| `resource-dependency-bound` | domain | `BindResourceDependencyUseCase` after persistence | Yes |

## Non-Effects

The command does not write raw connection secrets, mutate historical deployment snapshots, inject
runtime environment variables, create deployments, trigger redeploy/retry/rollback, create or
delete provider-native databases or Redis instances, rotate secrets, or run backup/restore. After
provider-native Postgres realization, binding admission requires a realized ready managed database.
Provider-native Redis realization applies the same requirement: managed Redis binding is allowed
only after the Redis resource is realized ready and resolvable through the dependency runtime secret
store. The governing spec is
[Redis Provider-Native Realization](../specs/049-redis-provider-native-realization/spec.md).
