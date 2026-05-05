# dependency-resources.provision-postgres Command Spec

## Intent

Create an Appaloft-managed Postgres dependency resource for one project/environment. The current
implementation records provider-neutral metadata only; the accepted
[Postgres Provider-Native Realization](../specs/038-postgres-provider-native-realization/spec.md)
Code Round upgrades this command to admit a durable provider-native realization attempt when the
selected provider supports managed Postgres.

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

After the provider-native Code Round, success means realization request accepted. Provider success
or failure is reflected through dependency resource state, safe read models, and lifecycle events.

## Failure

- `validation_error`, phase `dependency-resource-validation`
- `not_found`, phase `context-resolution`
- `conflict`, phase `dependency-resource-validation`
- future provider-native slice: `provider_capability_unsupported`, phase
  `dependency-resource-realization-admission`
- future provider-native slice: `provider_error`, phase `dependency-resource-realization`

## Non-Goals

No binding, provider-native credential rotation, backup/restore, runtime work, or deployment
snapshot mutation.
