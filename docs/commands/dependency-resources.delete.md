# dependency-resources.delete Command Spec

## Intent

Delete only dependency resource records that pass safety checks.

## Input

- `dependencyResourceId`

## Success

Returns `ok({ id })` and tombstones the dependency resource. Imported external dependency deletion
removes only Appaloft's control-plane record.

Deleting a realized Appaloft-managed Postgres resource must request/apply provider cleanup after
safety checks pass and tombstone the Appaloft record only after cleanup state is durable.

## Failure

- `not_found`
- `dependency_resource_delete_blocked`, category `conflict`, phase
  `dependency-resource-delete-safety`
- `dependency_resource_provider_delete_failed`, category `integration`, phase
  `dependency-resource-provider-delete`

## Blockers

- active/future ResourceBinding references;
- backup relationship metadata requiring retention;
- provider-managed unsafe state;
- deployment snapshot or retained reference blockers reported by the safety reader.

## Non-Goals

No external database deletion, runtime cleanup, backup deletion, bind mutation, secret rotation, or
snapshot rewrite. Provider-native deletion applies only to Appaloft-managed realized Postgres and
only after explicit delete safety passes.
