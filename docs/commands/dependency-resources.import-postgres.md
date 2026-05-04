# dependency-resources.import-postgres Command Spec

## Intent

Register an external Postgres dependency resource with a safe masked read model and a secret input
boundary for future binding.

## Input

- `projectId`
- `environmentId`
- `name`
- `endpoint`
- optional `databaseName`
- optional `username`
- optional `secretRef`
- optional `connectionSecret`
- optional `sslMode`
- optional `description`
- optional `backupRelationship`

## Success

Returns `ok({ id })`, persists a `postgres` `ResourceInstance` with source mode
`imported-external`, and never echoes raw connection secret material.

## Failure

- `validation_error`, phase `dependency-resource-validation`
- `not_found`, phase `context-resolution`
- `conflict`, phase `dependency-resource-validation`

## Secret Contract

Raw passwords, tokens, auth headers, cookies, SSH credentials, provider tokens, private keys, and
sensitive query parameters must not appear in command result, read models, events, errors, logs, or
deployment snapshots.
