# dependency-resources.provision-postgres Command Spec

## Intent

Create an Appaloft-managed Postgres dependency resource for one project/environment and admit a
durable provider-native realization attempt when the selected provider supports managed Postgres.
When `serverId` is supplied, the default shell provider realizes the database as a Docker-backed
container and volume on that single-server target.

## Input

- `projectId`
- `environmentId`
- `name`
- optional `serverId`
- optional `providerKey`
- optional `description`
- optional `backupRelationship`

## Success

Returns `ok({ id })`, persists a `postgres` `ResourceInstance`, and records a
`dependency-resource-created` domain event.

Success means realization request accepted. Provider success or failure is reflected through
dependency resource state, safe read models, lifecycle events, and safe operator-visible
process-attempt projection. For Docker-backed single-server realization, success stores an
Appaloft-owned connection secret ref, safe Docker provider handle, masked endpoint metadata, and a
binding-ready state when the secret can be resolved.

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
