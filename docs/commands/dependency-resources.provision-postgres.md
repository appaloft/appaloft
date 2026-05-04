# dependency-resources.provision-postgres Command Spec

## Intent

Create an Appaloft-managed Postgres dependency resource record for one project/environment without
creating a provider-native database in this slice.

## Input

- `projectId`
- `environmentId`
- `name`
- optional `providerKey`
- optional `description`
- optional `backupRelationship`

## Success

Returns `ok({ id })`, persists a `postgres` `ResourceInstance`, and records a
`dependency-resource-created` domain event.

## Failure

- `validation_error`, phase `dependency-resource-validation`
- `not_found`, phase `context-resolution`
- `conflict`, phase `dependency-resource-validation`

## Non-Goals

No provider-native provisioning, binding, secret rotation, backup/restore, runtime work, or
deployment snapshot mutation.
