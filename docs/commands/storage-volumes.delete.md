# storage-volumes.delete Command Spec

## Metadata

- Operation key: `storage-volumes.delete`
- Command class: `DeleteStorageVolumeCommand`
- Input schema: `DeleteStorageVolumeCommandInput`
- Handler: `DeleteStorageVolumeCommandHandler`
- Use case: `DeleteStorageVolumeUseCase`
- Domain / bounded context: Workload Delivery / StorageVolume
- Current status: proposed for Phase 7 Code Round

## Purpose

Delete only unattached storage that is not protected by backup relationship metadata.

## Input Model

| Field | Required | Domain meaning |
| --- | --- | --- |
| `storageVolumeId` | Yes | Volume to delete. |

## Branches

| Branch | Condition | Behavior | Result |
| --- | --- | --- | --- |
| Safe delete | No attachments or backup blockers | Tombstone/delete volume. | `ok({ id })` |
| Attached | One or more Resource attachments exist | Reject with safe blocker details. | `storage_volume_delete_blocked` |
| Backup relationship | Backup metadata requires retention | Reject with safe blocker details. | `storage_volume_delete_blocked` |

## Non-Effects

The command does not detach Resources, delete backup data, prune runtime artifacts, remove
provider-native volumes, or rewrite deployment snapshots.
