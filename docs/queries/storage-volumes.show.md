# storage-volumes.show Query Spec

## Metadata

- Operation key: `storage-volumes.show`
- Query class: `ShowStorageVolumeQuery`
- Input schema: `ShowStorageVolumeQueryInput`
- Handler: `ShowStorageVolumeQueryHandler`
- Query service: `ShowStorageVolumeQueryService`
- Domain / bounded context: Workload Delivery / StorageVolume read model
- Current status: proposed for Phase 7 Code Round

## Purpose

Read one storage volume with safe attachment summaries and backup relationship metadata.

## Input Model

| Field | Required | Domain meaning |
| --- | --- | --- |
| `storageVolumeId` | Yes | Volume to read. |

## Output Model

Returns `schemaVersion = "storage-volumes.show/v1"`, volume detail, attachment summaries, and
`generatedAt`.

The query returns `not_found` for missing/deleted volumes and never mutates runtime, Resource,
deployment snapshot, provider, backup, or restore state.
