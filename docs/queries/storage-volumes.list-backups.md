# storage-volumes.list-backups Query Spec

## Metadata

- Operation key: `storage-volumes.list-backups`
- Query class: `ListStorageVolumeBackupsQuery`
- Input schema: `ListStorageVolumeBackupsQueryInput`
- Handler: `ListStorageVolumeBackupsQueryHandler`
- Query service: `ListStorageVolumeBackupsQueryService`
- Domain / bounded context: Workload Delivery / StorageVolumeBackup read model
- Current status: active

## Purpose

List safe backup restore-point summaries for one StorageVolume.

## Input Model

| Field | Required | Domain meaning |
| --- | --- | --- |
| `storageVolumeId` | Yes | StorageVolume whose backups are listed. |
| `status` | No | Optional backup status filter. |

## Output Model

Returns `schemaVersion = "storage-volumes.backups.list/v1"`, backup summaries, and `generatedAt`.
The read model includes safe artifact handles, status, consistency, local-only classification,
retention status, and latest restore attempt summary.

## Non-Effects

The query never exposes credentials, reads artifact bytes, mutates backup state, or reads
DependencyResource backups.
