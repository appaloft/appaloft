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

<h2 id="storage-volume-surfaces">Entrypoint differences</h2>

The CLI fits create, inspect, rename, delete, attach, and detach workflows. The HTTP API uses the
same command/query schemas. Web write controls are deferred; Resource detail can show safe storage
attachment summaries.
