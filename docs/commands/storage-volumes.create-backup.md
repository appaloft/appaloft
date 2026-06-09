# storage-volumes.create-backup Command Spec

## Metadata

- Operation key: `storage-volumes.create-backup`
- Command class: `CreateStorageVolumeBackupCommand`
- Input schema: `CreateStorageVolumeBackupCommandInput`
- Handler: `CreateStorageVolumeBackupCommandHandler`
- Use case: `CreateStorageVolumeBackupUseCase`
- Domain / bounded context: Workload Delivery / StorageVolumeBackup
- Current status: active

## Purpose

Create a StorageVolume backup artifact through a source adapter and target provider. Source
consistency and target storage are separate extension axes.

## Branches

| Branch | Condition | Behavior | Result |
| --- | --- | --- | --- |
| Planned and supported | Backup plan has no blockers and adapter/provider can execute. | Persist pending backup, run source adapter, store artifact, mark ready. | `ok({ id })` |
| Unsupported source or target | Plan has blockers or no executable adapter/provider. | Reject before unsafe copy. | `provider_capability_unsupported` |
| Source/target execution fails | Adapter or provider returns an error. | Persist failed backup with safe failure code/message. | `ok({ id })` with failed readback |

## Events

Publishes storage backup domain facts only after persistence succeeds.

## Non-Effects

The command does not run DependencyResource backup/restore, expose raw credentials, attach restored
volumes, replace runtime mounts, or treat local-only artifacts as disaster recovery.
