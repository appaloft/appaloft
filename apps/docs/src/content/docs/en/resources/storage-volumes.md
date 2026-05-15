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

<h2 id="storage-volume-surfaces">Entrypoint differences</h2>

The CLI fits create, inspect, rename, delete, attach, and detach workflows. The HTTP API uses the
same command/query schemas. Web Resource detail includes a Storage section that lists available
storage volumes for the current project/environment, shows safe attachment summaries, creates,
renames, and deletes provider-neutral storage volume records, and can attach or detach storage from
the Resource profile. Web can also run dry-run-first runtime cleanup for one storage volume on one
server: it previews candidates and blockers first, then sends destructive cleanup only after
confirmation. Web still does not provider-provision storage volumes or run broad Docker prune.
