# Storage Volume Resource Visibility

## Status

- Behavior id: `096-storage-volume-resource-visibility`
- Round: Code + Sync
- Artifact state: implemented first slice for the storage/dependency boundary correction
- Roadmap target: post-Blueprint marketplace usability and day-two data visibility
- Compatibility impact: additive Web/read-model wording improvement
- Decision state: governed by ADR-083

## Business Outcome

When an operator opens a Resource, mounted storage is visible without requiring them to know that
storage lives under the Settings tab. A volume-backed application such as PocketBase should show
the mounted storage path, mount mode, storage volume kind/id, and backup capability status in the
Resource overview.

The user must not be led to believe that a `volume` requirement is a Dependency Resource or that
SQLite/application files on a volume are covered by DependencyResource backup/restore.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| StorageVolume | Durable storage identity that can be mounted by Resources. | Workload Delivery / Storage | volume, persistent storage |
| ResourceStorageAttachment | Resource-owned mount intent from a StorageVolume to a workload destination path. | Resource profile | storage mount |
| Mounted storage summary | Read-only Resource detail section that shows attached storage. | Web/API read model | storage attachment summary |
| DependencyResource | Service-like dependency consumed through connection/readiness/secret refs. | Dependency Resources | database, cache, object store, search dependency |
| Storage backup capability status | Readback telling whether StorageVolume backup/restore is available. | Storage / Web | backup support badge |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| STOR-VIS-SOT-001 | Source of truth records the boundary | A user reports a Blueprint-deployed PocketBase volume is hard to find | The behavior round starts | ADR/spec/plan/tasks define StorageVolume versus DependencyResource, phase 1 visibility scope, and backup execution as the separate storage-owned Spec 098 slice. |
| STOR-VIS-OVERVIEW-001 | Resource overview exposes mounted storage | A Resource has one or more `storageAttachments`, for example `/pb_data` | The operator opens Resource overview | Overview shows a mounted storage section with count, storage volume id/kind, destination path, mount mode, and a Storage settings action. |
| STOR-VIS-OVERVIEW-002 | Resource detail read model carries display-safe storage identity | A Resource attachment points at a known StorageVolume | `resources.show` assembles Resource detail | The storage attachment summary includes safe display name when available and still falls back to storage volume id when the read model cannot join the volume. |
| STOR-VIS-BACKUP-001 | Storage backup status is explicit | A Resource has storage attachments and storage backup operations may return provider blockers | The operator views overview or Storage settings | UI points to Storage settings for StorageVolume backup planning/status, shows blockers when no safe adapter/provider exists, and does not point to DependencyResource backup actions. |
| STOR-VIS-DEPENDENCY-001 | Dependency wording excludes volumes | A Blueprint has `volume` requirements | The operator reads Resource or dependency copy | Wording says volume-backed data is managed through StorageVolume and ResourceStorageAttachment, while DependencyResource backup is for service dependencies. |
| STOR-VIS-MOBILE-001 | Mounted storage summary is responsive | The operator opens Resource overview at a narrow viewport | The Resource has long volume ids or paths | Storage rows wrap safely and do not create horizontal overflow. |

## Domain Ownership

- Bounded context: Workload Delivery / Storage Volume Lifecycle.
- Aggregate/resource owner:
  - `Resource` owns storage attachment profile state.
  - `StorageVolume` owns durable storage identity and deletion safety.
  - Dependency Resources do not own volume-backed application data.
- Downstream surfaces:
  - `resources.show` provides `storageAttachments`.
  - Resource detail Web renders overview and settings from the same read model.

## Public Surfaces

- API/oRPC: no new mutation in this slice. `resources.show` continues returning
  `storageAttachments`; the summary may include a display-safe StorageVolume name when the public
  read model can join it. Missing names must not hide the attachment.
- CLI: no new command in this slice.
- Web/UI: Resource overview adds mounted storage visibility and points backup management/status to
  Resource settings Storage. Resource settings Storage is the management surface for lifecycle,
  runtime cleanup, and storage backup plan/artifact/restore/prune controls.
- Config: not applicable.
- Events: not applicable.
- Public docs/help: storage and dependency docs must preserve the distinction.
- Future MCP/tools: no new operation in this slice.

## Output Contract

The overview may render only fields already safe in Resource read models:

- attachment id;
- storage volume id;
- storage volume name when available;
- storage volume kind;
- destination path;
- mount mode;
- attached timestamp when available;
- backup capability status.

The output must not include host secrets, provider credentials, raw runtime paths beyond already
accepted bind-mount source path readback, dump contents, or provider SDK payloads.

## Non-Goals

- No backup execution inside the overview visibility section; backup execution belongs to the
  separate Storage settings controls and Spec 098 operation family.
- No application-bundle snapshot migration.
- No provider-specific storage provisioning.
- No Cloud-only workaround around public Appaloft Resource and StorageVolume contracts.

## Open Questions

- Whether Storage should become a first-class Resource tab later instead of remaining under
  Settings.
