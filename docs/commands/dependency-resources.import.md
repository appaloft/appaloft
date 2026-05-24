# dependency-resources.import Command Spec

## Intent

Register an external dependency resource with a safe masked read model and a secret input boundary
for future binding. The same command handles `postgres`, `redis`, `mysql`, `clickhouse`,
`object-storage`, and `opensearch`.

## Input

- `kind`
- `projectId`
- `environmentId`
- `name`
- `connectionUrl`
- optional `secretRef`
- optional `connectionSecret`
- optional `description`
- optional `backupRelationship`

## Success

Returns `ok({ id })`, persists a dependency `ResourceInstance` with source mode
`imported-external`, and never echoes raw connection secret material.

## Failure

- `validation_error`, phase `dependency-resource-validation`
- `not_found`, phase `context-resolution`
- `conflict`, phase `dependency-resource-validation`

## Secret Contract

Raw passwords, tokens, auth headers, cookies, SSH credentials, provider tokens, private keys, and
sensitive query parameters must not appear in command result, read models, events, errors, logs, or
deployment snapshots.
