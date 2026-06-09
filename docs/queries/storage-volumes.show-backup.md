# storage-volumes.show-backup Query Spec

## Metadata

- Operation key: `storage-volumes.show-backup`
- Query class: `ShowStorageVolumeBackupQuery`
- Input schema: `ShowStorageVolumeBackupQueryInput`
- Handler: `ShowStorageVolumeBackupQueryHandler`
- Query service: `ShowStorageVolumeBackupQueryService`
- Domain / bounded context: Workload Delivery / StorageVolumeBackup read model
- Current status: active

## Purpose

Read one StorageVolume backup artifact summary.

## Input Model

| Field | Required | Domain meaning |
| --- | --- | --- |
| `backupId` | Yes | StorageVolumeBackup id. |

## Output Model

Returns `schemaVersion = "storage-volumes.backups.show/v1"`, the backup summary, and
`generatedAt`.

## Non-Effects

The query does not restore, prune, expose artifact contents, or call dependency backup providers.
