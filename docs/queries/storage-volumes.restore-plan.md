# storage-volumes.restore-plan Query Spec

## Metadata

- Operation key: `storage-volumes.restore-plan`
- Query class: `CreateStorageVolumeRestorePlanQuery`
- Input schema: `CreateStorageVolumeRestorePlanQueryInput`
- Handler: `CreateStorageVolumeRestorePlanQueryHandler`
- Query service: `CreateStorageVolumeRestorePlanQueryService`
- Domain / bounded context: Workload Delivery / StorageVolumeBackup restore plan
- Current status: active

## Purpose

Preview restore safety for one StorageVolume backup. Restore defaults to a new StorageVolume.

## Input Model

| Field | Required | Domain meaning |
| --- | --- | --- |
| `backupId` | Yes | Backup restore point. |
| `targetMode` | No | `new-volume` by default; `in-place` is destructive. |
| `targetStorageVolumeId` | No | Target volume for destructive restore planning. |
| `acknowledgeDestructiveRestore` | No | Explicit operator acknowledgement for in-place restore planning. |

## Output Model

Returns `schemaVersion = "storage-volumes.restore-plan/v1"`, source volume id, target mode,
destructive flag, default restored volume name, and blockers.

## Non-Effects

The query never creates a volume, restores data, switches runtime mounts, or calls
DependencyResource restore.
