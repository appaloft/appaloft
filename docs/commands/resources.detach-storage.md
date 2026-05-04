# resources.detach-storage Command Spec

## Metadata

- Operation key: `resources.detach-storage`
- Command class: `DetachResourceStorageCommand`
- Input schema: `DetachResourceStorageCommandInput`
- Handler: `DetachResourceStorageCommandHandler`
- Use case: `DetachResourceStorageUseCase`
- Domain / bounded context: Workload Delivery / Resource profile
- Current status: proposed for Phase 7 Code Round

## Purpose

Remove one Resource storage attachment while leaving the StorageVolume and historical deployment
snapshots intact.

## Input Model

| Field | Required | Domain meaning |
| --- | --- | --- |
| `resourceId` | Yes | Resource whose profile attachment is removed. |
| `attachmentId` | Yes | Resource attachment identity. |

## Events

| Event | Type | Publisher | Required? |
| --- | --- | --- | --- |
| `resource-storage-detached` | domain | `DetachResourceStorageUseCase` after persistence | Yes when removed |

## Non-Effects

The command does not delete the StorageVolume, prune runtime state, backup/restore data, or rewrite
deployment snapshots.
