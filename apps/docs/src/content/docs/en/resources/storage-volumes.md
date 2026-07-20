---
title: "Storage volumes"
description: "Manage persistent storage volumes and attach them safely to Resources."
docType: task
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "storage"
  - "volume"
  - "bind mount"
  - "named volume"
  - "persistent storage"
relatedOperations:
  - storage-volumes.create
  - storage-volumes.list
  - storage-volumes.show
  - storage-volumes.rename
  - storage-volumes.delete
  - storage-volumes.cleanup-runtime
  - storage-volumes.backup-plan
  - storage-volumes.create-backup
  - storage-volumes.list-backups
  - storage-volumes.show-backup
  - storage-volumes.restore-plan
  - storage-volumes.restore-backup
  - storage-volumes.prune-backups
  - resources.attach-storage
  - resources.detach-storage
sidebar:
  label: "Storage volumes"
  order: 5
---

<h2 id="storage-volume-lifecycle">Storage volume lifecycle</h2>

A storage volume is Appaloft's durable storage intent. It can be a named volume or a trusted bind
mount. Creating a storage volume does not create a deployment and does not immediately change a
running container.

Common entrypoints:

```bash title="Create a named volume"
appaloft storage volume create --project prj_prod --environment env_prod --name uploads
```

```bash title="Inspect storage"
appaloft storage volume list --project prj_prod
appaloft storage volume show vol_uploads
```

<h2 id="storage-volume-attachment">Attach to a Resource</h2>

A Resource storage attachment describes which storage volume a future deployment should mount and
which container path should receive it. It affects later deployment snapshots only. It does not
rewrite completed or running deployments.

```bash title="Attach storage to a Resource"
appaloft resource storage attach res_web vol_uploads --destination-path /app/uploads
```

A Resource cannot have two storage attachments at the same destination path. The destination path is
an absolute path inside the workload container, not a host path.

<h2 id="storage-volume-config-file">Declare storage in appaloft.yaml</h2>

For repository-driven deploys, you can ask Appaloft to create or reuse a managed named volume and
attach it before deployment:

```yaml
storage:
  uploads:
    kind: volume
    source: managed
    mount:
      path: /app/uploads
```

`mount.path` is the path inside the workload container. It is not a host bind source path. The
config workflow keeps deployment admission ids-only: it reconciles storage through
`storage-volumes.list`, `storage-volumes.create`, `resources.show`, and
`resources.attach-storage`, then creates the deployment from the selected ids.

For pull request previews, add `preview.lifecycle: ephemeral` only when the preview storage should
be cleaned up on PR close. Preview cleanup removes storage only when the source link proves that
repository config created and attached that exact preview volume.

<h2 id="storage-volume-delete-safety">Delete safety</h2>

Before deleting a storage volume, Appaloft must confirm that no active Resource attachment, backup
retention rule, or other safety blocker remains. Delete does not automatically detach Resources,
delete provider runtime volumes, remove backup data, or rewrite historical deployment snapshots.

If delete is blocked, inspect the attachment summary in `storage-volumes.show`, then explicitly
detach the affected Resource.

Runtime volume cleanup is a separate dry-run-first operation, `storage-volumes.cleanup-runtime`.
Start with:

```bash title="Preview runtime cleanup"
appaloft storage volume cleanup-runtime vol_uploads --server srv_primary --before 2026-01-01T00:00:00.000Z
```

Destructive cleanup requires `--dry-run false`. The current implementation inspects only the
selected Appaloft-owned Docker named volume on a local-shell or generic-SSH server, and preserves
candidates with active runtime, attachment, snapshot, rollback candidate, backup retention, or
in-flight backup/restore safety evidence. It does not delete bind-mount source paths,
provider-native storage handles, backup data, or broad Docker prune targets, and it must not be
triggered implicitly by `storage-volumes.delete` or folded into `servers.capacity.prune`. Docker
Swarm Compose stack storage mount realization happens during deployment execution: Appaloft renders
a stack override for Compose workloads with explicit target service metadata, deploys a candidate
stack, verifies it, then cleans superseded Appaloft stacks/services.

<h2 id="storage-volume-backup-restore">Storage volume backup and restore</h2>

Storage volume backup protects application data mounted into a Resource, such as PocketBase
`/pb_data`, upload directories, JSON files, or SQLite files. It is not DependencyResource backup:
Postgres and Redis-style service dependencies still use `dependency-resources.*`, while SQLite or
application files stored on a volume use `storage-volumes.*` backup and restore operations.

Plan before execution. The plan selects a source adapter and target provider, reports consistency,
local-only status, retention impact, and blockers. When no safe adapter/provider exists, Appaloft
fails closed instead of falling back to unsafe live file copy:

```bash title="Plan a volume backup"
appaloft storage volume backup plan \
  --storage-volume vol_uploads \
  --resource res_pocketbase \
  --destination-path /pb_data \
  --data-format sqlite \
  --consistency application-consistent \
  --target-provider local-filesystem \
  --target-ref /var/lib/appaloft/backups \
  --retention-max-count 3 \
  --retention-min-free-bytes 1073741824
```

When the plan has no blockers, create the backup:

```bash title="Create a volume backup"
appaloft storage volume backup create \
  --storage-volume vol_uploads \
  --destination-path /pb_data \
  --data-format sqlite \
  --consistency application-consistent \
  --target-provider local-filesystem \
  --target-ref /var/lib/appaloft/backups \
  --retention-max-count 3 \
  --retention-min-free-bytes 1073741824
```

Inspect, restore, and prune restore points:

```bash title="Manage volume restore points"
appaloft storage volume backup list --storage-volume vol_uploads
appaloft storage volume backup show svb_123
appaloft storage volume backup restore-plan svb_123
appaloft storage volume backup restore svb_123 --restored-volume-name pb-data-restored
appaloft storage volume backup prune svb_123
```

Restore defaults to a new StorageVolume. Attaching that restored volume back to a Resource, or
switching an existing mount, is a separate explicit operator action. A local filesystem target is
only a same-host or same-failure-domain restore point, not disaster recovery. Public Appaloft also
provides an S3-compatible runtime target, but a distribution must explicitly register its
short-lived object-transfer broker, safe bucket/key policy, and credential reference before the
target becomes available. Long-lived object-storage credentials are not sent to the workload
server or persisted in backup readback. WebDAV, Restic repository, and provider snapshot targets
still require their own distribution/runtime adapters.

<h2 id="storage-volume-surfaces">Entrypoint differences</h2>

The CLI fits create, inspect, rename, delete, attach, and detach workflows. The HTTP API uses the
same command/query schemas. Web Resource detail includes a Storage section that lists available
storage volumes for the current project/environment, shows safe attachment summaries, creates,
renames, and deletes provider-neutral storage volume records, and can attach or detach storage from
the Resource profile. Web can also run dry-run-first runtime cleanup for one storage volume on one
server: it previews candidates and blockers first, then sends destructive cleanup only after
confirmation. Web Storage settings can also plan volume backups, display blockers, list restore
points, restore to a new volume, and prune selected backups. Web still does not
provider-provision storage volumes or run broad Docker prune.
