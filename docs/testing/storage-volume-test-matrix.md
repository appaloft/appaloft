# Storage Volume Test Matrix

## Scope

This matrix covers Phase 7 storage volume lifecycle and resource attachment baseline:

- `storage-volumes.create`
- `storage-volumes.list`
- `storage-volumes.show`
- `storage-volumes.rename`
- `storage-volumes.delete`
- `resources.attach-storage`
- `resources.detach-storage`
- `resources.show` storage attachment summaries

## Global References

- [Storage Volume Lifecycle Workflow](../workflows/storage-volume-lifecycle.md)
- [Storage Volume Lifecycle And Resource Attachment](../specs/032-storage-volume-lifecycle-and-resource-attachment/spec.md)
- [Resource Profile Lifecycle](../workflows/resource-profile-lifecycle.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)

## Coverage Rows

| ID | Operation | Type | Scenario | Expected | Automation Binding |
| --- | --- | --- | --- | --- | --- |
| STOR-VOL-CREATE-001 | `storage-volumes.create` | Core/application | Create named volume. | Persists active volume, emits `storage-volume-created`, returns `ok({ id })`. | `packages/core/test/storage-volume.test.ts`; `packages/application/test/storage-volume-lifecycle.test.ts` |
| STOR-VOL-CREATE-002 | `storage-volumes.create` | Core/application | Create bind mount with safe source path. | Persists bind source path as provider/runtime boundary data. | `packages/application/test/storage-volume-lifecycle.test.ts` |
| STOR-VOL-CREATE-003 | `storage-volumes.create` | Core/application | Bind source path is unsafe. | Returns `validation_error`, `phase = storage-volume-validation`, no mutation. | `packages/core/test/storage-volume.test.ts`; `packages/application/test/storage-volume-lifecycle.test.ts` |
| STOR-VOL-RENAME-001 | `storage-volumes.rename` | Application | Rename active volume. | Changes name/slug, emits `storage-volume-renamed`, does not mutate attachments. | Covered by `RenameStorageVolumeUseCase` and typecheck; focused rename test deferred. |
| STOR-VOL-DELETE-001 | `storage-volumes.delete` | Application | Delete unattached volume with no backup blocker. | Tombstones/deletes volume and normal reads omit it. | Covered by `StorageVolume.delete`; focused unattached application test deferred. |
| STOR-VOL-DELETE-002 | `storage-volumes.delete` | Application/persistence | Delete attached volume. | Returns `storage_volume_delete_blocked` with attachment blocker details. | `packages/core/test/storage-volume.test.ts`; `packages/application/test/storage-volume-lifecycle.test.ts`; `packages/persistence/pg/test/storage-volume.pglite.test.ts` |
| STOR-VOL-DELETE-003 | `storage-volumes.delete` | Application | Delete volume with backup relationship blocker. | Returns `storage_volume_delete_blocked`; backup data unchanged. | Covered by `StorageVolume.delete`; focused backup blocker test deferred. |
| STOR-ATTACH-001 | `resources.attach-storage` | Core/application | Attach active volume to active resource at safe destination. | Persists resource attachment, emits `resource-storage-attached`, returns `ok({ id })`. | `packages/core/test/resource-storage-attachment.test.ts`; `packages/application/test/storage-volume-lifecycle.test.ts`; `packages/persistence/pg/test/storage-volume.pglite.test.ts` |
| STOR-ATTACH-002 | `resources.attach-storage` | Core/application | Duplicate destination path on same resource. | Returns `conflict`, `phase = resource-storage-attachment`, no mutation. | `packages/core/test/resource-storage-attachment.test.ts`; `packages/application/test/storage-volume-lifecycle.test.ts` |
| STOR-ATTACH-003 | `resources.attach-storage` | Application | Archived resource. | Returns `resource_archived`, no event. | Covered by Resource lifecycle guard; focused archived-resource attachment test deferred. |
| STOR-ATTACH-004 | `resources.attach-storage` | Core/application | Unsafe destination path. | Returns `validation_error`, `phase = resource-storage-attachment`, no mutation. | Covered by `StorageDestinationPath.create`; focused use-case test deferred. |
| STOR-DETACH-001 | `resources.detach-storage` | Application | Detach existing attachment. | Removes attachment, emits `resource-storage-detached`, StorageVolume remains. | `packages/core/test/resource-storage-attachment.test.ts`; `packages/application/test/storage-volume-lifecycle.test.ts` |
| STOR-READ-001 | `storage-volumes.list/show` | Query/read model | Volume has attachments. | Returns safe attachment summaries. | `packages/application/test/storage-volume-lifecycle.test.ts`; `packages/persistence/pg/test/storage-volume.pglite.test.ts` |
| STOR-READ-002 | `resources.show` | Query/read model | Resource has storage attachments. | Returns `storageAttachments` in `resources.show/v1`. | Covered by `ShowResourceQueryService` mapping and `resourceDetailSchema`; focused show-resource test deferred. |
| STOR-SNAPSHOT-001 | deployment snapshot | Application | Resource with storage attachments creates future deployment snapshot. | Snapshot contains provider-neutral mount metadata; no provider provisioning. | Deferred; snapshot materialization is out of this baseline Code Round. |
| STOR-ENTRY-001 | Operation catalog | Catalog | Storage operations are public. | Operation catalog and `CORE_OPERATIONS.md` contain one row per operation; no generic update. | `packages/application/test/operation-catalog-boundary.test.ts`; `packages/docs-registry/test/operation-coverage.test.ts` |
| STOR-ENTRY-002 | CLI | Entrypoint | Storage and attach/detach commands submitted. | CLI dispatches command/query bus using application schema. | Typechecked `packages/adapters/cli/src/commands/storage.ts` and `resource.ts`; focused CLI dispatch test deferred. |
| STOR-ENTRY-003 | oRPC/HTTP | Entrypoint | Storage and attach/detach routes submitted. | Routes dispatch command/query bus using application schema. | Typechecked `packages/orpc/src/index.ts`; focused HTTP dispatch test deferred. |

## Required Non-Coverage Assertions

Tests must assert storage commands do not:

- create deployments;
- mutate historical deployment snapshots;
- restart, stop, prune, or clean runtime state;
- provision provider-native Docker/Compose/Swarm volumes;
- bind or unbind dependency resources;
- perform backup or restore;
- expose secrets, credentials, auth headers, cookies, provider tokens, or private keys.

## Current Implementation Notes And Migration Gaps

This baseline implements storage volume lifecycle, Resource attachment profile mutation, read
models, CLI/oRPC route contracts, and delete-safety gates. Deployment snapshot materialization, Web
write affordances, provider-native realization, backup/restore, Docker Swarm volume behavior, and
runtime cleanup are deferred to future Phase 7 slices.
