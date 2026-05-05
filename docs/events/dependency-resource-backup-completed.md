# dependency-resource-backup-completed Event Spec

## Meaning

A provider backup attempt completed and produced a safe restore point.

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
- `providerArtifactHandle`
- `completedAt`
- optional `retentionExpiresAt`

## Safety

The payload must not include dump contents, raw connection URLs, passwords, provider credentials,
provider SDK payloads, or command output.

