# dependency-resources.provision Command Spec

## Intent

Create an Appaloft-managed dependency resource for one project/environment and admit a durable
provider-native realization attempt when the selected provider supports the requested kind. The
same command handles `postgres`, `redis`, `mysql`, `clickhouse`, `object-storage`, and
`opensearch`. When `serverId` is supplied, the default shell provider realizes Docker-backed
infrastructure on that single-server target.

## Input

- `kind`
- `projectId`
- `environmentId`
- `name`
- optional `serverId`
- optional `providerKey`
- optional `description`
- optional `backupRelationship`

## Success

Returns `ok({ id })`, persists a dependency `ResourceInstance`, and records a
`dependency-resource-created` domain event.

Success means realization request accepted. Provider success or failure is reflected through
dependency resource state, safe read models, lifecycle events, and safe operator-visible
process-attempt projection. Provider-returned raw connection values are stored through
`DependencyResourceSecretStore`; public state stores only safe provider handle, masked endpoint, and
secret-reference metadata.

## Failure

- `validation_error`, phase `dependency-resource-validation`
- `not_found`, phase `context-resolution`
- `conflict`, phase `dependency-resource-validation`
- `provider_capability_unsupported`, phase `dependency-resource-realization-admission`
- `provider_error`, phase `dependency-resource-realization`
- `dependency_secret_store_error`, phase `dependency-resource-realization`

## Non-Goals

No binding, provider-native credential rotation, scheduled backups, runtime restart, or deployment
snapshot mutation.
