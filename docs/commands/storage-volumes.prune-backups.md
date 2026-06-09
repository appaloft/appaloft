# storage-volumes.prune-backups Command Spec

## Metadata

- Operation key: `storage-volumes.prune-backups`
- Command class: `PruneStorageVolumeBackupCommand`
- Input schema: `PruneStorageVolumeBackupCommandInput`
- Handler: `PruneStorageVolumeBackupCommandHandler`
- Use case: `PruneStorageVolumeBackupUseCase`
- Domain / bounded context: Workload Delivery / StorageVolumeBackup
- Current status: active

## Purpose

Prune one StorageVolume backup artifact after provider retention handling.

## Input Model

| Field | Required | Domain meaning |
| --- | --- | --- |
| `backupId` | Yes | StorageVolumeBackup to prune. |

## Branches

| Branch | Condition | Behavior | Result |
| --- | --- | --- | --- |
| Prunable backup | Backup exists and no restore is pending. | Ask target provider to prune artifact when available, then mark backup pruned. | `ok({ id, prunedAt })` |
| Restore pending | Latest restore attempt is pending. | Reject prune to preserve restore safety. | `conflict` |

## Non-Effects

The command does not delete StorageVolume records, cleanup runtime volumes, prune dependency
backups, or broad-prune provider storage.
