# dependency-resource-restore-failed Event Spec

## Meaning

A provider restore attempt failed after the restore request was accepted.

## Producer

Dependency resource restore provider workflow.

## Payload

- `backupId`
- `restoreAttemptId`
- `dependencyResourceId`
- `projectId`
- `environmentId`
- `dependencyKind`
- `providerKey`
- `failureCode`
- `failedAt`

## Safety

Failure metadata must be sanitized and must not include dump contents, raw connection URLs,
passwords, provider credentials, provider SDK payloads, or command output.

