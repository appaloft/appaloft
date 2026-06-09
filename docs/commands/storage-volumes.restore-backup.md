# storage-volumes.restore-backup Command Spec

## Metadata

- Operation key: `storage-volumes.restore-backup`
- Command class: `RestoreStorageVolumeBackupCommand`
- Input schema: `RestoreStorageVolumeBackupCommandInput`
- Handler: `RestoreStorageVolumeBackupCommandHandler`
- Use case: `RestoreStorageVolumeBackupUseCase`
- Domain / bounded context: Workload Delivery / StorageVolumeBackup
- Current status: active

## Purpose

Restore a StorageVolume backup artifact to a new StorageVolume by default. Replacing a live runtime
mount is a separate operator action.

## Branches

| Branch | Condition | Behavior | Result |
| --- | --- | --- | --- |
| New volume restore | Backup is ready and target provider can restore. | Create new StorageVolume, restore artifact into it, mark restore completed. | `ok({ id, restoredStorageVolumeId })` |
| In-place requested | `targetMode = in-place`. | Block the destructive path in this slice. | `conflict`, `storage_volume_restore_in_place_not_enabled` |
| No restore point | Backup has no artifact handle. | Reject before provider call. | `conflict`, `storage_volume_backup_has_no_restore_point` |

## Non-Effects

The command does not attach the restored volume, switch Resource storage attachments, restart
runtime, overwrite existing volume data, or invoke DependencyResource restore.
