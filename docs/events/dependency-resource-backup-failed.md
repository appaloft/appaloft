# dependency-resource-backup-failed Event Spec

## Meaning

A provider backup attempt failed after the backup request was accepted.

## Producer

Dependency resource backup provider workflow.

## Payload

- `backupId`
- `dependencyResourceId`
- `projectId`
- `environmentId`
- `dependencyKind`
- `providerKey`
- `attemptId`
- `failureCode`
- `failedAt`

## Safety

Failure metadata must be sanitized and must not include dump contents, raw connection URLs,
passwords, provider credentials, provider SDK payloads, or command output.

