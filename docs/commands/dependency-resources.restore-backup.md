# dependency-resources.restore-backup Command Spec

## Intent

Accept a restore request from a ready restore point into its owning dependency resource by default,
or into one explicitly selected ready same-kind dependency resource in the same project and
environment.

## Input

- `backupId`
- `acknowledgeDataOverwrite`
- `acknowledgeRuntimeNotRestarted`
- optional `targetDependencyResourceId`
- optional `restoreLabel`

## Success

Returns `ok({ id })`, persists a restore attempt, and records
`dependency-resource-restore-requested`. The accepted and final provider restore outcomes are
projected into `operator-work.*` through safe process-attempt rows keyed by the restore attempt id.

Success means restore request accepted. Provider restore success or failure is reflected through
restore attempt state, safe read models, operator-work visibility, and lifecycle events.

## Failure

- `validation_error`, phase `dependency-resource-restore-validation`
- `not_found`, phase `context-resolution`
- `dependency_resource_restore_blocked`, phase `dependency-resource-restore-admission`
- `provider_capability_unsupported`, phase `dependency-resource-restore-admission`
- `provider_error`, phase `dependency-resource-restore`

When `targetDependencyResourceId` is supplied, the restore attempt records both the backup owner and
target. The command does not rebind resources; switching runtime traffic remains an explicit
binding/configuration and deployment workflow after restore verification.

## Non-Goals

No provider-created clone, export, deployment rollback, automatic rebind/redeploy, runtime
environment injection, workload restart, or historical snapshot rewrite.
