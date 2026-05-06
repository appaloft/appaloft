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

The Redis provider-native realization Spec Round positions the same rule for realized
Appaloft-managed Redis after its Code Round: provider cleanup must run only after delete safety
passes, and the Appaloft record is tombstoned only after cleanup state is durable.

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
snapshot rewrite. Current provider-native deletion applies only to Appaloft-managed realized
Postgres. Realized managed Redis cleanup is governed by
[Redis Provider-Native Realization](../specs/049-redis-provider-native-realization/spec.md) and
remains unimplemented until its Code Round.
