# storage-volumes.list Query Spec

## Metadata

- Operation key: `storage-volumes.list`
- Query class: `ListStorageVolumesQuery`
- Input schema: `ListStorageVolumesQueryInput`
- Handler: `ListStorageVolumesQueryHandler`
- Query service: `ListStorageVolumesQueryService`
- Domain / bounded context: Workload Delivery / StorageVolume read model
- Current status: proposed for Phase 7 Code Round

## Purpose

List non-deleted storage volumes with safe attachment summaries.

## Input Model

| Field | Required | Domain meaning |
| --- | --- | --- |
| `projectId` | No | Optional project filter. |
| `environmentId` | No | Optional environment filter. |

## Output Model

Returns `schemaVersion = "storage-volumes.list/v1"`, `items[]`, and `generatedAt`.
Each item includes identity, ownership, kind, optional description, optional bind source path,
backup relationship summary, lifecycle status, created timestamp, and attachment summary.

The query is read-only and must not mutate Resource or StorageVolume state.
