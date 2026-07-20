# dependency-resource-restore-requested Event Spec

## Meaning

A dependency resource restore request was accepted and durable restore attempt state exists. The
target is the backup owner unless a different ready same-kind dependency was selected.

## Producer

`dependency-resources.restore-backup`

## Payload

- `backupId`
- `restoreAttemptId`
- `dependencyResourceId`
- optional `targetDependencyResourceId`
- `projectId`
- `environmentId`
- `dependencyKind`
- `providerKey`
- `requestedAt`

## Safety

The payload must not include dump contents, raw connection URLs, passwords, provider credentials,
provider SDK payloads, or command output.
