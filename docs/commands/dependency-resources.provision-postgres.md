# dependency-resources.provision-postgres Command Spec

## Intent

Create an Appaloft-managed Postgres dependency resource for one project/environment and admit a
durable provider-native realization attempt when the selected provider supports managed Postgres.

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

Success means realization request accepted. Provider success or failure is reflected through
dependency resource state, safe read models, and lifecycle events.

## Failure

- `validation_error`, phase `dependency-resource-validation`
- `not_found`, phase `context-resolution`
- `conflict`, phase `dependency-resource-validation`
- `provider_capability_unsupported`, phase `dependency-resource-realization-admission`
- `provider_error`, phase `dependency-resource-realization`

## Non-Goals

No binding, provider-native credential rotation, backup/restore, runtime work, or deployment
snapshot mutation.
