# dependency-resources.import-redis Command Spec

## Intent

Register an external Redis dependency resource with a safe masked read model and a secret input
boundary for future binding.

## Input

- `projectId`
- `environmentId`
- `name`
- `endpoint`
- optional `port`
- optional `databaseIndex`
- optional `username`
- optional `secretRef`
- optional `connectionSecret`
- optional `connectionUrl`
- optional `tlsMode`
- optional `description`
- optional `backupRelationship`

## Success

Returns `ok({ id })`, persists a `redis` `ResourceInstance` with source mode `imported-external`,
and never echoes raw connection secret material.

## Failure

- `validation_error`, phase `dependency-resource-validation`
- `not_found`, phase `context-resolution`
- `conflict`, phase `dependency-resource-validation`

## Secret Contract

Raw passwords, ACL credentials, tokens, auth headers, cookies, TLS private keys, provider tokens,
private keys, raw connection URIs, and sensitive query parameters must not appear in command
result, read models, events, errors, logs, or deployment snapshots.
