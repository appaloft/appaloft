# dependency-resource-restore-requested Event Spec

## Meaning

An in-place dependency resource restore request was accepted and durable restore attempt state
exists.

## Producer

`dependency-resources.restore-backup`

## Payload

- `backupId`
- `restoreAttemptId`
- `dependencyResourceId`
- `projectId`
- `environmentId`
- `dependencyKind`
- `providerKey`
- `requestedAt`

## Safety

The payload must not include dump contents, raw connection URLs, passwords, provider credentials,
provider SDK payloads, or command output.

