# dependency-resources.backup-policies.configure Command Spec

## Intent

Create or update the scheduled backup policy for one dependency resource.

## Input

- `dependencyResourceId`
- optional `policyId`
- optional `version`
- `retentionDays`
- `scheduleIntervalHours`
- optional `providerKey`
- optional `retryOnFailure`
- optional `enabled`
- optional `nextRunAt`

## Success

Returns `ok({ id })` and persists safe policy metadata. This command does not run a backup
immediately; due policy execution is owned by the disabled-by-default scheduled dependency backup
runner, which dispatches `dependency-resources.create-backup`.

## Failure

- `validation_error`, phase `operation-input`
- `infra`, phase `dependency-resource-backup-policy`

## Non-Goals

No backup execution, backup prune/delete, backup export, provider-native credential rotation,
runtime restart, deployment snapshot mutation, or raw dump access.

## Current Implementation Notes

`retentionDays` is policy metadata for backup retention. Automatic prune/export behavior remains a
future slice.
