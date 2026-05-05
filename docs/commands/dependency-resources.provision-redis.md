# dependency-resources.provision-redis Command Spec

## Intent

Create an Appaloft-managed Redis dependency resource record for one project/environment without
creating a provider-native Redis instance in this slice.

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

## Failure

- `validation_error`, phase `dependency-resource-validation`
- `not_found`, phase `context-resolution`
- `conflict`, phase `dependency-resource-validation`

## Non-Goals

No provider-native Redis provisioning, Redis binding, secret rotation, backup/restore, runtime
work, runtime environment injection, or deployment snapshot mutation.
