# storage-volumes.rename Command Spec

## Metadata

- Operation key: `storage-volumes.rename`
- Command class: `RenameStorageVolumeCommand`
- Input schema: `RenameStorageVolumeCommandInput`
- Handler: `RenameStorageVolumeCommandHandler`
- Use case: `RenameStorageVolumeUseCase`
- Domain / bounded context: Workload Delivery / StorageVolume
- Current status: proposed for Phase 7 Code Round

## Purpose

Change a StorageVolume's operator-facing name without altering attachments, backup metadata,
provider realization, or historical deployment snapshots.

## Input Model

| Field | Required | Domain meaning |
| --- | --- | --- |
| `storageVolumeId` | Yes | Volume to rename. |
| `name` | Yes | New operator-facing name; slug derives from this. |

## Events

| Event | Type | Publisher | Required? |
| --- | --- | --- | --- |
| `storage-volume-renamed` | domain | `RenameStorageVolumeUseCase` after persistence | Yes when changed |

## Non-Effects

The command does not detach resources, mutate runtime state, change bind source path, or rewrite
deployment snapshots.
