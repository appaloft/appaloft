# resources.rotate-dependency-binding-secret Command Spec

## Operation

- Operation key: `resources.rotate-dependency-binding-secret`
- Command class: `RotateResourceDependencyBindingSecretCommand`
- Input schema: `RotateResourceDependencyBindingSecretCommandInput`
- Handler: `RotateResourceDependencyBindingSecretCommandHandler`
- Use case: `RotateResourceDependencyBindingSecretUseCase`
- Owner: `ResourceBinding`
- Status: accepted candidate; not active until Code Round adds catalog, transport, and tests

## Purpose

Replace the safe secret reference/version used by one active Resource dependency binding for future
deployment snapshot references without changing the Dependency Resource, provider database,
runtime state, or historical deployment snapshots.

## Input Contract

| Field | Required | Meaning |
| --- | --- | --- |
| `resourceId` | Yes | Resource that owns the dependency binding. |
| `bindingId` | Yes | ResourceBinding whose secret reference is rotated. |
| `secretRef` | Conditional | Existing secret-store reference to use for future snapshots. Required unless `secretValue` is supplied. |
| `secretValue` | Conditional | Secret-bearing input accepted only at the command boundary and persisted through the configured secret-store boundary. Must never be echoed. |
| `confirmHistoricalSnapshotsRemainUnchanged` | Yes | Explicit acknowledgement that existing deployments keep their captured snapshot reference. |

Exactly one of `secretRef` or `secretValue` must be supplied. Build-time secret exposure remains
forbidden by the Resource secret rules and this command must not create build-time plaintext output.

## Behavior

| Case | Given | Then |
| --- | --- | --- |
| Rotate | Active binding belongs to `resourceId` and new secret input is safe | Persist new safe binding secret reference/version and return `{ id, rotatedAt, secretVersion }`. |
| Missing binding | Binding does not exist or does not belong to `resourceId` | Return `not_found`, no mutation. |
| Removed binding | Binding is already removed/tombstoned | Return `resource_dependency_binding_rotation_blocked`, no mutation. |
| Missing acknowledgement | Historical snapshot acknowledgement is false or absent | Return `validation_error`, phase `resource-dependency-binding-secret-rotation`, no mutation. |
| Unsafe secret exposure | Input/output would expose raw secret material or materialized env value | Return `validation_error`, phase `resource-dependency-binding-secret-rotation`, no mutation or leaked details. |

## Events

| Event | Type | Producer | Published |
| --- | --- | --- | --- |
| `resource-dependency-binding-secret-rotated` | domain | `RotateResourceDependencyBindingSecretUseCase` after persistence | Yes |

Event payload must include safe ids, `rotatedAt`, and safe `secretVersion` metadata. It must not
include raw secret material, raw connection URLs, passwords, tokens, auth headers, cookies, SSH
credentials, provider tokens, private keys, sensitive query parameters, previous plaintext, or
materialized environment values.

## Errors

- `validation_error`, phase `resource-dependency-binding-secret-rotation`
- `not_found`, phase `resource-dependency-binding-secret-rotation`
- `resource_dependency_binding_rotation_blocked`, category `conflict`, phase
  `resource-dependency-binding-secret-rotation`, `retriable = false`
- `infra_error`, phase `resource-dependency-binding-secret-rotation` for secret-store or
  persistence failures without leaking secret details

## Entrypoints

- CLI: `appaloft resource dependency rotate-secret <resourceId> <bindingId>`
- HTTP: `POST /api/resources/{resourceId}/dependency-bindings/{bindingId}/secret-rotations`
- oRPC: route reuses `RotateResourceDependencyBindingSecretCommandInput`
- Web: deferred
- Future MCP/tools: one tool maps to this command

## Explicit Non-Effects

The command does not:

- rotate provider-native database credentials;
- delete, rename, or mutate the Dependency Resource;
- unbind or rebind the ResourceBinding;
- inject runtime environment variables;
- restart, redeploy, retry, rollback, stop, start, or clean runtime workloads;
- run backup/restore;
- rewrite historical deployment snapshots.

## Test Matrix

- DEP-BIND-ROTATE-001
- DEP-BIND-ROTATE-002
- DEP-BIND-ROTATE-003
- DEP-BIND-ROTATE-004
- DEP-BIND-ROTATE-005
- DEP-BIND-ROTATE-006
