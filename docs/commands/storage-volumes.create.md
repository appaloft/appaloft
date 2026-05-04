# storage-volumes.create Command Spec

## Metadata

- Operation key: `storage-volumes.create`
- Command class: `CreateStorageVolumeCommand`
- Input schema: `CreateStorageVolumeCommandInput`
- Handler: `CreateStorageVolumeCommandHandler`
- Use case: `CreateStorageVolumeUseCase`
- Domain / bounded context: Workload Delivery / StorageVolume
- Current status: proposed for Phase 7 Code Round

## Purpose

Create a provider-neutral durable storage volume that can later be attached to Resources.

## Input Model

| Field | Required | Domain meaning |
| --- | --- | --- |
| `projectId` | Yes | Project that owns the volume. |
| `environmentId` | Yes | Environment that owns the volume. |
| `name` | Yes | Operator-facing volume name; slug derives from this. |
| `kind` | Yes | `named-volume` or `bind-mount`. |
| `description` | No | Safe operator notes. |
| `sourcePath` | Required for `bind-mount` | Trusted host/runtime source path. |
| `backupRelationship` | No | Metadata-only future backup relationship summary. |

## Branches

| Branch | Condition | Behavior | Result |
| --- | --- | --- | --- |
| Named volume | `kind = named-volume` | Persist volume without source path. | `ok({ id })` |
| Bind mount | `kind = bind-mount` and safe `sourcePath` | Persist volume with normalized source path. | `ok({ id })` |
| Unsafe source | Bind path invalid | Reject before persistence. | `validation_error`, `phase = storage-volume-validation` |

## Events

| Event | Type | Publisher | Required? |
| --- | --- | --- | --- |
| `storage-volume-created` | domain | `CreateStorageVolumeUseCase` after persistence | Yes |

## Non-Effects

The command does not attach storage, create deployments, provision provider-native volumes, run
Docker/Compose/Swarm, perform backup/restore, or mutate runtime state.
