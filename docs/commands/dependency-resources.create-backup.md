# dependency-resources.create-backup Command Spec

## Intent

Accept a backup request for one ready dependency resource and create a durable backup attempt that
may produce a safe restore point.

## Input

- `dependencyResourceId`
- optional `description`
- optional `retentionPolicy`
- optional `providerKey` override when the dependency resource supports more than one backup
  capability

## Success

Returns `ok({ id })`, persists a `DependencyResourceBackup` attempt, and records
`dependency-resource-backup-requested`.

Success means backup request accepted. Provider backup success or failure is reflected through
backup state, safe read models, and lifecycle events.

## Failure

- `validation_error`, phase `dependency-resource-backup-validation`
- `not_found`, phase `context-resolution`
- `dependency_resource_backup_blocked`, phase `dependency-resource-backup-admission`
- `provider_capability_unsupported`, phase `dependency-resource-backup-admission`
- `provider_error`, phase `dependency-resource-backup`

## Non-Goals

No restore, backup deletion/prune, scheduled backup policy, runtime restart, deployment snapshot
mutation, or raw dump export.

