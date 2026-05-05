# dependency-resource-restore-completed Event Spec

## Meaning

A provider restore attempt completed for an existing dependency resource restore point.

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
- `completedAt`

## Safety

The payload must not include dump contents, raw connection URLs, passwords, provider credentials,
provider SDK payloads, or command output.

