# Storage Volume Lifecycle Workflow Spec

## Normative Contract

Storage Volume Lifecycle is the provider-neutral workflow for managing durable storage and attaching
it to Resources for deployment snapshot materialization.

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
- [ADR-064: Storage Volume Runtime Realization And Cleanup](../decisions/ADR-064-storage-volume-runtime-realization-and-cleanup.md)
- [Storage Volume Test Matrix](../testing/storage-volume-test-matrix.md)
- [Storage Volume Lifecycle And Resource Attachment](../specs/032-storage-volume-lifecycle-and-resource-attachment/spec.md)
- [Storage Volume Runtime Realization And Cleanup](../specs/070-storage-volume-runtime-realization-and-cleanup/spec.md)
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

Storage attachments affect deployment planning only. When a deployment snapshot is materialized, it
may include immutable provider-neutral mount metadata derived from current Resource storage
attachments.

`deployments.create` must not accept storage volume, bind mount, or destination path fields. Entry
workflows that want storage must first dispatch storage/resource attachment operations, then create
a deployment from ids-only context.

## Runtime Realization And Cleanup

Storage runtime realization is deployment-driven by default. `storage-volumes.create` records
provider-neutral control-plane state only. When a deployment snapshot includes storage mount
metadata, the selected runtime target adapter may realize the concrete Docker/Compose/Swarm
image-service or Swarm Compose stack mount as part of deployment execution. Swarm Compose stack
realization requires explicit target service metadata and uses a generated Appaloft override during
`docker stack deploy`; it does not change `storage-volumes.create` semantics.

Runtime volume cleanup is governed by ADR-064 and the `storage-volumes.cleanup-runtime` command.
Cleanup must be dry-run-first, storage-volume plus server scoped, and must preserve active
attachments, active runtimes, retained deployment snapshots, rollback candidates, backup/restore
blockers, Appaloft state roots, and bind mount source paths. Cleanup safety reads storage backup
retention and in-flight backup/restore evidence through an application safety reader; the default
shell implementation reports no such work until storage backup/restore exists. The first runtime
implementation covers local-shell and generic-SSH Docker named-volume inspection/cleanup. It must
not run through `servers.capacity.prune`, and it must not be implied by
`storage-volumes.delete`.

## Entrypoints

| Entrypoint | Required behavior |
| --- | --- |
| CLI | Separate `appaloft storage volume ...` and `appaloft resource storage attach/detach` commands. No generic `storage update`. |
| oRPC / HTTP | Routes reuse command/query schemas and dispatch through bus. |
| Web | Resource detail Storage section reads `resources.show.storageAttachments`, lists project/environment storage volumes through `storage-volumes.list`, dispatches `storage-volumes.create/rename/delete`, dispatches `resources.attach-storage` / `resources.detach-storage`, and exposes `storage-volumes.cleanup-runtime` as a dry-run-first server-scoped control with destructive confirmation. |
| Automation / MCP | Generated tool descriptors map one-to-one to operation keys. |

## Current Implementation Notes And Governed Follow-Ups

This Code Round adds the provider-neutral storage volume lifecycle and Resource storage attachment
baseline. Web Resource detail can create/rename/delete provider-neutral storage volume records,
attach/detach storage volumes to/from the Resource profile, and observe delete blockers through
shared command errors. Provider-native upfront provisioning through `storage-volumes.create` is
intentionally not part of v1; deployment execution is the default runtime realization point.
Resource detail Web also exposes the explicit runtime cleanup command as dry-run-first maintenance
control for one StorageVolume on one server. Storage backup/restore, provider-native storage
handles, and bind-mount path cleanup are later governed provider/storage extensions, not implicit
`storage-volumes.create` behavior. GitHub Actions/local explicit Swarm and storage-cleanup gates
cover generated overrides, named-volume creation, route reachability, dry-run-first cleanup, and
scoped destructive cleanup without making those target-mutating proofs part of default local checks.
Storage backup/restore cleanup blockers are wired as a safety seam for those later operations.

## Open Questions

- Whether cross-resource shared writable volume attachments need an explicit sharing policy before
  being allowed outside single-resource use remains a future decision.
