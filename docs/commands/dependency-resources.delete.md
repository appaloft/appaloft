# dependency-resources.delete Command Spec

## Intent

Delete only dependency resource records that pass safety checks.

## Input

- `dependencyResourceId`

## Success

Returns `ok({ id })` and tombstones the dependency resource. Imported external Postgres deletion
removes only Appaloft's control-plane record.

## Failure

- `not_found`
- `dependency_resource_delete_blocked`, category `conflict`, phase
  `dependency-resource-delete-safety`

## Blockers

- active/future ResourceBinding references;
- backup relationship metadata requiring retention;
- provider-managed unsafe state;
- deployment snapshot or retained reference blockers reported by the safety reader.

## Non-Goals

No external database deletion, provider-native deletion, runtime cleanup, backup deletion, bind
mutation, secret rotation, or snapshot rewrite.
