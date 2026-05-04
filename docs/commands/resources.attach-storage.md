# resources.attach-storage Command Spec

## Metadata

- Operation key: `resources.attach-storage`
- Command class: `AttachResourceStorageCommand`
- Input schema: `AttachResourceStorageCommandInput`
- Handler: `AttachResourceStorageCommandHandler`
- Use case: `AttachResourceStorageUseCase`
- Domain / bounded context: Workload Delivery / Resource profile
- Current status: proposed for Phase 7 Code Round

## Purpose

Attach an existing StorageVolume to a Resource at a normalized workload destination path for future
deployment snapshot materialization.

## Input Model

| Field | Required | Domain meaning |
| --- | --- | --- |
| `resourceId` | Yes | Resource receiving the attachment. |
| `storageVolumeId` | Yes | Storage volume being attached. |
| `destinationPath` | Yes | Absolute workload path where storage will mount. |
| `mountMode` | No | `read-write` by default; future slices may support `read-only`. |

## Branches

| Branch | Condition | Behavior | Result |
| --- | --- | --- | --- |
| Attach | Active resource and volume, safe destination | Persist attachment on Resource profile. | `ok({ id })` |
| Duplicate destination | Same Resource already uses destination | Reject before mutation. | `conflict`, `phase = resource-storage-attachment` |
| Archived resource | Resource archived | Reject through resource lifecycle guard. | `resource_archived` |
| Unsafe destination | Destination is `/`, relative, contains `..`, URL-like, or unsafe | Reject before mutation. | `validation_error` |

## Events

| Event | Type | Publisher | Required? |
| --- | --- | --- | --- |
| `resource-storage-attached` | domain | `AttachResourceStorageUseCase` after persistence | Yes |

## Non-Effects

The command does not provision provider volumes, create deployments, restart runtime, apply mounts
to a running workload, or mutate historical snapshots.
