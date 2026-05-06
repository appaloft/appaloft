# dependency-resources.provision-redis Command Spec

## Intent

Create an Appaloft-managed Redis dependency resource record for one project/environment.

Current implementation persists provider-neutral metadata only. The Phase 7
[Redis Provider-Native Realization](../specs/049-redis-provider-native-realization/spec.md) Spec
Round positions this same command to admit durable provider-native Redis realization when the Code
Round is implemented.

## Input

- `projectId`
- `environmentId`
- `name`
- optional `providerKey`
- optional `description`
- optional `backupRelationship`

## Success

Returns `ok({ id })`, persists a `redis` `ResourceInstance`, and records a
`dependency-resource-created` domain event.

After the provider-native Redis Code Round, success remains acceptance-first: the command must
persist the dependency resource and realization attempt before requesting provider work, and
provider follow-up success or failure is observed through dependency resource state, events, and
read models.

## Failure

- `validation_error`, phase `dependency-resource-validation`
- `not_found`, phase `context-resolution`
- `conflict`, phase `dependency-resource-validation`

## Non-Goals

No provider-native Redis provisioning, Redis binding, secret rotation, backup/restore, runtime
work, runtime environment injection, or deployment snapshot mutation in current code. The
provider-native Redis Spec Round removes provider-native provisioning/deletion from this non-goal
only after its Code Round is implemented.
