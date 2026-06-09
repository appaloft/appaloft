# storage-volumes.backup-plan Query Spec

## Metadata

- Operation key: `storage-volumes.backup-plan`
- Query class: `CreateStorageVolumeBackupPlanQuery`
- Input schema: `CreateStorageVolumeBackupPlanQueryInput`
- Handler: `CreateStorageVolumeBackupPlanQueryHandler`
- Query service: `CreateStorageVolumeBackupPlanQueryService`
- Domain / bounded context: Workload Delivery / StorageVolumeBackup
- Current status: active

## Purpose

Preview whether a StorageVolume backup can run with the requested source consistency, target
provider, and retention guardrails. Planning never exposes provider credentials and never falls
back to unsafe live file copy.

## Input Model

| Field | Required | Domain meaning |
| --- | --- | --- |
| `source.storageVolumeId` | Yes | StorageVolume to back up. |
| `source.resourceId` | No | Resource context for mounted application data. |
| `source.destinationPath` | No | Mounted path, such as `/pb_data`. |
| `source.dataFormat` | No | Source data format hint, such as `sqlite` or `filesystem`. |
| `source.liveWrites` | No | Whether writes may be active while backing up. |
| `requestedConsistency` | Yes | Minimum consistency level required by the operator. |
| `preferredSourceAdapter` | No | Optional source adapter preference. |
| `target.providerKey` | Yes | Backup target provider family. |
| `target.targetRef` | Yes | Safe target reference; credentials stay in secret refs. |
| `retention` | Yes | Max count/age/bytes/free-disk guardrails. |

## Output Model

Returns `schemaVersion = "storage-volumes.backup-plan/v1"`, selected adapter/provider keys,
consistency, local-only classification, retention, and blockers.

## Non-Effects

The query does not create a backup, mutate provider state, prune artifacts, restore data, run
DependencyResource backup, or copy live SQLite files.
