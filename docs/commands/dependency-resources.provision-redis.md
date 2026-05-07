# dependency-resources.provision-redis Command Spec

## Intent

Create an Appaloft-managed Redis dependency resource for one project/environment and admit
provider-native Redis realization when the selected provider supports it.

The Phase 7
[Redis Provider-Native Realization](../specs/049-redis-provider-native-realization/spec.md)
governs the durable realization attempt, safe provider handle, masked endpoint metadata, and
binding-readiness semantics.

## Input

- `projectId`
- `environmentId`
- `name`
- optional `providerKey`
- optional `description`
- optional `backupRelationship`

## Success

Returns `ok({ id })`, persists a `redis` `ResourceInstance` and realization attempt, records a
`dependency-resource-created` domain event, then requests provider realization through the managed
Redis provider port.

Success is acceptance-first: provider follow-up success or failure is observed through dependency
resource state, events, and read models. Realization success records a safe provider handle, masked
endpoint metadata, optional safe connection secret ref, `ready` lifecycle status, and
`dependency-resource-realized`. Realization failure records degraded status, blocked binding
readiness, and sanitized failure metadata while preserving the accepted command result.

## Failure

- `validation_error`, phase `dependency-resource-validation`
- `not_found`, phase `context-resolution`
- `conflict`, phase `dependency-resource-validation`
- `provider_capability_unsupported`, phase `dependency-resource-realization-admission`

## Non-Goals

No Redis credential rotation, backup/restore policy, runtime work, runtime environment injection,
deployment snapshot mutation, or provider SDK shape leakage through this command.
