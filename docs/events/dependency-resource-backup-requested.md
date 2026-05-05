# dependency-resource-backup-requested Event Spec

## Meaning

A dependency resource backup request was accepted and durable backup attempt state exists.

## Producer

`dependency-resources.create-backup`

## Payload

- `backupId`
- `dependencyResourceId`
- `projectId`
- `environmentId`
- `dependencyKind`
- `providerKey`
- `attemptId`
- `requestedAt`

## Safety

The payload must not include raw dump contents, raw connection URLs, passwords, provider
credentials, provider SDK payloads, or command output.

