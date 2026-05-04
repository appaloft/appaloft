# Storage Volume Lifecycle Workflow Spec

## Normative Contract

Storage Volume Lifecycle is the provider-neutral workflow for managing durable storage and attaching
it to Resources for future deployments.

It is not provider-native Docker volume provisioning, not backup/restore, not runtime cleanup, and
not a deployment command. Every mutation must dispatch one explicit operation:

- `storage-volumes.create`
- `storage-volumes.rename`
- `storage-volumes.delete`
- `resources.attach-storage`
- `resources.detach-storage`

Every storage read must dispatch one explicit query:

- `storage-volumes.list`
- `storage-volumes.show`

`resources.show` may include resource-owned `storageAttachments` as part of the Resource profile
read surface.

## Global References

- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-014: Deployment Admission Uses Resource Profile](../decisions/ADR-014-deployment-admission-uses-resource-profile.md)
- [ADR-016: Deployment Command Surface Reset](../decisions/ADR-016-deployment-command-surface-reset.md)
- [ADR-026: Aggregate Mutation Command Boundary](../decisions/ADR-026-aggregate-mutation-command-boundary.md)
- [ADR-028: Command Coordination Scope And Mutation Admission](../decisions/ADR-028-command-coordination-scope-and-mutation-admission.md)
- [Storage Volume Test Matrix](../testing/storage-volume-test-matrix.md)
- [Storage Volume Lifecycle And Resource Attachment](../specs/032-storage-volume-lifecycle-and-resource-attachment/spec.md)
- [Resource Profile Lifecycle](./resource-profile-lifecycle.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)

## Workflow Purpose

The workflow lets operators:

1. Create a named volume or bind mount as durable Appaloft storage.
2. List and show storage with safe attachment summaries.
3. Rename a volume without changing existing attachments or historical deployment snapshots.
4. Attach storage to a Resource at an absolute normalized destination path.
5. Detach storage from a Resource without deleting the underlying volume.
6. Delete only unattached, non-backup-blocked storage.

## Operation Boundaries

| User intent | Operation | Mutates | Must not mutate |
| --- | --- | --- | --- |
| Create storage | `storage-volumes.create` | `StorageVolume` | Resource attachment, runtime, provider volume backend, deployment snapshots |
| List storage | `storage-volumes.list` | Nothing | Any aggregate or runtime state |
| Show storage | `storage-volumes.show` | Nothing | Any aggregate or runtime state |
| Rename storage | `storage-volumes.rename` | Storage name/slug | Attachments, runtime, snapshots, backup data |
| Delete storage | `storage-volumes.delete` | Storage lifecycle/tombstone | Attached resources, backups, runtime cleanup |
| Attach storage | `resources.attach-storage` | Resource storage attachment profile | Storage lifecycle, runtime, snapshots, deployment admission input |
| Detach storage | `resources.detach-storage` | Resource storage attachment profile | Storage deletion, runtime cleanup, snapshots |

## Storage Kinds

| Kind | Required fields | Meaning |
| --- | --- | --- |
| `named-volume` | name/project/environment | Provider-neutral durable volume identity. Runtime adapters may later map it to Docker/Compose/Swarm volume realization. |
| `bind-mount` | name/project/environment/sourcePath | Trusted host/runtime source path. It is adapter/runtime boundary data and must be validated before persistence. |

Bind source paths must be absolute normalized paths, must not be `/`, must not contain `..`, must
not be URL-like, and must not contain shell metacharacters. Destination paths follow the same
absolute normalized path rule and are always workload-target paths, not host paths.

## Attachment Rules

- A Resource may attach multiple StorageVolumes.
- One Resource may not have two attachments at the same `destinationPath`.
- Attachments require the StorageVolume and Resource to be in the same project/environment unless a
  future spec introduces cross-environment sharing.
- Archived or deleted Resources reject attach/detach mutations.
- A detached StorageVolume remains available for future attachment or deletion.
- Historical deployment snapshots are immutable and are never rewritten by attach/detach.

## Delete Safety

`storage-volumes.delete` is synchronous write-side deletion/tombstone behavior. It must fail before
mutation when:

- any active Resource attachment references the volume;
- backup relationship metadata marks retention, backup set ownership, restore point relationship,
  or other future backup safety blocker;
- the volume is already invisible or not found.

Failure uses stable structured errors and safe blocker details. It must not cascade detach, delete
backups, prune runtime state, or remove provider-native volumes.

## Deployment Relationship

Storage attachments affect future deployment planning only. When a future deployment snapshot is
materialized, it may include immutable provider-neutral mount metadata derived from current
Resource storage attachments.

`deployments.create` must not accept storage volume, bind mount, or destination path fields. Entry
workflows that want storage must first dispatch storage/resource attachment operations, then create
a deployment from ids-only context.

## Entrypoints

| Entrypoint | Required behavior |
| --- | --- |
| CLI | Separate `appaloft storage volume ...` and `appaloft resource storage attach/detach` commands. No generic `storage update`. |
| oRPC / HTTP | Routes reuse command/query schemas and dispatch through bus. |
| Web | May read `resources.show.storageAttachments`; write UI is deferred unless implemented with i18n and tests. |
| Automation / MCP | Future tools map one-to-one to operation keys. |

## Current Implementation Notes And Migration Gaps

This Code Round adds the provider-neutral storage volume lifecycle and Resource storage attachment
baseline. Provider-native volume realization, backup/restore, Docker Swarm realization, and runtime
cleanup are future work.

## Open Questions

- Whether cross-resource shared writable volume attachments need an explicit sharing policy before
  being allowed outside single-resource use remains a future decision.
