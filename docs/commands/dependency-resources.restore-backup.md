# dependency-resources.restore-backup Command Spec

## Intent

Accept an in-place restore request from a ready restore point back into the same dependency
resource.

## Input

- `backupId`
- `acknowledgeDataOverwrite`
- `acknowledgeRuntimeNotRestarted`
- optional `restoreLabel`

## Success

Returns `ok({ id })`, persists a restore attempt, and records
`dependency-resource-restore-requested`.

Success means restore request accepted. Provider restore success or failure is reflected through
restore attempt state, safe read models, and lifecycle events.

## Failure

- `validation_error`, phase `dependency-resource-restore-validation`
- `not_found`, phase `context-resolution`
- `dependency_resource_restore_blocked`, phase `dependency-resource-restore-admission`
- `provider_capability_unsupported`, phase `dependency-resource-restore-admission`
- `provider_error`, phase `dependency-resource-restore`

## Non-Goals

No cross-resource restore, clone, export, deployment rollback, redeploy, runtime environment
injection, workload restart, or historical snapshot rewrite.

