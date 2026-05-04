# Storage Volume Lifecycle And Resource Attachment

## Status

- Round: Spec Round
- Artifact state: ready for Test-First / Code Round
- Roadmap target: Phase 7 / `0.9.0` beta, Day-Two Production Controls
- Compatibility impact: `pre-1.0-policy`, additive public CLI/API/oRPC capability

## Business Outcome

Operators can create durable storage volumes, inspect where they are used, attach them to a
Resource at a safe target path, detach them without deleting data, and receive a safety failure
before deleting storage that is still attached or reserved for future backup relationships.

This slice establishes the provider-neutral baseline that later Postgres, Redis, backup/restore,
Docker Swarm volume realization, runtime cleanup, and dependency-resource provisioning must reuse.
Users should not SSH to a server to hand-write Docker volumes, bind mounts, Compose volume blocks,
or runtime directories for ordinary persistent storage.

## Discover Findings

1. Existing Phase 7 config/secret work expresses evidence and readiness through explicit command
   results, masked read models, stable operation keys, `ResourceConfigOverrideSet`, and
   `resources.effective-config`; storage should follow the same future-deployment snapshot
   boundary and must not expose sensitive host paths beyond the provided storage source path.
2. Context repair is not applicable here. Storage attachment is a write-side command over durable
   Resource profile state plus a StorageVolume aggregate; read surfaces report summaries only.
3. A StorageVolume needs id, project/environment ownership, name/slug, kind, optional description,
   optional bind source path for bind mounts, backup relationship metadata, lifecycle status, and
   attachment summaries. A Resource attachment needs attachment id, storage volume id, resource id,
   destination path, mounted read/write mode, and attached timestamp.
4. The first slice supports `named-volume` and `bind-mount`. Both are structurally validated and
   recorded provider-neutrally; no provider-native volume provisioning or runtime mount execution is
   performed in the storage commands.
5. Downstream runtime planning may consume attachments only as immutable mount metadata when a
   future deployment snapshot is materialized. The storage commands do not pollute runtime catalog,
   effect execution, deployment admission input, or recommendation surfaces.
6. Contradictions are represented as validation/conflict errors: unsafe destination path, missing
   storage volume, missing/archived/deleted resource, duplicate resource destination path, attached
   volume deletion, or backup relationship safety blocker.
7. No ADR is needed for this slice because it reuses accepted ADR-012, ADR-014, ADR-016, ADR-026,
   and ADR-028 boundaries. It adds a new aggregate and operation set inside the existing
   resource-profile/deployment-snapshot model without changing deployment admission, runtime
   ownership, provider contract, async acceptance, or command coordination policy.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| StorageVolume | Durable provider-neutral storage identity owned by a project/environment. | Workload Delivery | volume |
| NamedVolume | Provider-neutral durable volume whose concrete backend name is resolved by runtime adapters later. | StorageVolume | Docker volume, Compose volume |
| BindMount | StorageVolume whose source path is a trusted host/runtime boundary field. | StorageVolume | host path mount |
| ResourceStorageAttachment | Resource-owned attachment from one StorageVolume to one destination path. | Resource profile | mount |
| StorageDestinationPath | Absolute normalized path inside the workload where storage is mounted. | ResourceStorageAttachment | mount target |
| BackupRelationshipMetadata | Safe metadata that marks a volume as reserved or related to future backup/restore flows. | StorageVolume | backup relationship |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| STOR-VOL-CREATE-001 | Create named volume | Active project/environment context | `storage-volumes.create` with kind `named-volume` | Volume is persisted, event is recorded, list/show can read it. |
| STOR-VOL-CREATE-002 | Create bind mount | Active project/environment context | `storage-volumes.create` with kind `bind-mount` and source path | Source path is validated as safe provider/runtime boundary data. |
| STOR-VOL-CREATE-003 | Reject unsafe bind path | Active context | Bind source path is empty, relative, URL-like, root-only, contains `..`, or includes shell metacharacters | Command returns `validation_error`, `phase = storage-volume-validation`. |
| STOR-VOL-RENAME-001 | Rename volume | Existing volume | `storage-volumes.rename` supplies new name | Name/slug change without mutating attachments or deployment snapshots. |
| STOR-VOL-DELETE-001 | Delete unattached volume | Existing unattached volume with no backup blocker | `storage-volumes.delete` | Volume moves to deleted state and normal list/show omits it. |
| STOR-VOL-DELETE-002 | Block attached volume delete | Existing attached volume | `storage-volumes.delete` | Command returns `storage_volume_delete_blocked` with attachment blocker details. |
| STOR-VOL-DELETE-003 | Block backup relationship delete | Existing volume with backup relationship metadata requiring retention | `storage-volumes.delete` | Command returns `storage_volume_delete_blocked` and does not delete backup-related data. |
| STOR-ATTACH-001 | Attach storage to resource | Active resource and active volume in same project/environment | `resources.attach-storage` with absolute destination path | Resource records attachment and show/list surfaces expose safe summaries. |
| STOR-ATTACH-002 | Reject duplicate destination | Resource already has attachment at destination | Another attachment uses same destination path | Command returns `conflict`, `phase = resource-storage-attachment`. |
| STOR-ATTACH-003 | Reject archived resource | Resource is archived | `resources.attach-storage` | Command returns `resource_archived`, no storage mutation. |
| STOR-ATTACH-004 | Reject unsafe destination | Destination path is `/`, relative, contains `..`, or uses unsupported characters | `resources.attach-storage` | Command returns `validation_error`, no attachment. |
| STOR-DETACH-001 | Detach storage | Existing attachment | `resources.detach-storage` | Attachment is removed; StorageVolume remains. |
| STOR-READ-001 | Volume read summaries | Existing volume attachments | `storage-volumes.list/show` | Output includes safe attachment summaries, not runtime/provider secrets. |
| STOR-READ-002 | Resource read summaries | Resource has storage attachments | `resources.show` | Output includes `storageAttachments` as future-deployment profile data. |
| STOR-SNAPSHOT-001 | Deployment snapshot metadata | Resource has storage attachments | Future deployment plan/snapshot materialization reads profile | Immutable runtime plan metadata includes provider-neutral mount entries without provisioning provider-native volumes. |

## Domain Ownership

- Bounded context: Workload Delivery.
- Aggregate/resource owners:
  - `StorageVolume` owns volume identity, kind, lifecycle, bind source path, backup relationship
    metadata, and deletion safety state.
  - `Resource` owns `ResourceStorageAttachment` entries and destination-path uniqueness.
- Upstream/downstream contexts:
  - Runtime target adapters may later realize mount metadata from deployment snapshots.
  - Dependency resources, backup/restore, Postgres/Redis provisioning, Docker Swarm, and runtime
    cleanup must reuse this storage/attachment language.

## Public Surfaces

- API/oRPC: add create/list/show/rename/delete storage volume routes and resource attach/detach
  routes using application command/query schemas.
- CLI: add `appaloft storage volume ...` commands plus
  `appaloft resource storage attach` and `appaloft resource storage detach`.
- Web/UI: deferred for this slice unless an existing read surface renders `storageAttachments`.
- Config: no repository config fields in this slice.
- Events: internal domain events for create/rename/delete/attach/detach; no integration events.
- Public docs/help: add stable help anchors or mark as Docs Round migration gap if docs site coverage
  is not expanded in this PR.
- Future MCP/tools: one operation per command/query; no compound "manage storage" tool.

## Output Contracts

`storage-volumes.list` and `storage-volumes.show` return JSON-first safe summaries:

- `schemaVersion`;
- volume identity, ownership, kind, name, slug, lifecycle, created timestamp;
- optional description;
- optional bind source path for bind mounts;
- backup relationship metadata summary;
- attachment summaries by resource id/name/slug and destination path;
- generated timestamp.

`resources.show` may include:

- `storageAttachments[]` with attachment id, storage volume id/name/kind, destination path, mounted
  mode, and attached timestamp.

Attachment/read outputs must not include raw secrets, credentials, tokens, auth headers, cookies,
provider tokens, private keys, or hidden runtime state.

## Non-Goals

- No BattleSnapshot or context repair behavior.
- No automatic storage repair, migration, pruning, backup, restore, provider volume provisioning, or
  Docker Swarm native realization.
- No Postgres/Redis provisioning, dependency bind/unbind, secret rotation, deploy retry, redeploy,
  rollback, runtime restart, or runtime cleanup.
- No mutation of historical deployment snapshots.
- No new `deployments.create` input fields.
- No active effect, AI recommendation, route repair, or catalog/effect execution behavior.

## Open Questions

- Multi-resource shared writable volume semantics are intentionally conservative: first slice may
  allow multiple attachments only when the destination uniqueness is per resource and the volume
  metadata does not mark exclusive future backup/runtime ownership. If implementation cannot prove a
  safe write-sharing rule, it should fail closed and record a migration gap.
