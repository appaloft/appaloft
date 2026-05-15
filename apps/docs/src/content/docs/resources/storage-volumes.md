---
title: "Storage volumes"
description: "管理持久化存储卷，并把它们安全挂载到 Resource。"
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
  - "存储卷"
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

<h2 id="storage-volume-lifecycle">存储卷生命周期</h2>

Storage volume 是 Appaloft 记录的持久化存储意图。它可以是 named volume，也可以是受信任的
bind mount。创建存储卷不会创建 deployment，也不会立即修改运行中的容器。

常用入口：

```bash title="创建 named volume"
appaloft storage volume create --project prj_prod --environment env_prod --name uploads
```

```bash title="查看存储卷"
appaloft storage volume list --project prj_prod
appaloft storage volume show vol_uploads
```

<h2 id="storage-volume-attachment">挂载到 Resource</h2>

Resource storage attachment 描述未来部署应该把哪个 storage volume 挂到容器内哪个路径。它只影响
之后的部署快照，不会改写已经完成或正在运行的部署。

```bash title="把存储卷挂载到 Resource"
appaloft resource storage attach res_web vol_uploads --destination-path /app/uploads
```

一个 Resource 不能在同一个 destination path 上挂载两个存储卷。destination path 必须是容器内绝对路径，不是宿主机路径。

<h2 id="storage-volume-delete-safety">删除安全</h2>

删除存储卷前，Appaloft 必须确认没有活动 Resource attachment、备份保留或其他安全 blocker。删除不会自动
detach Resource，也不会清理运行时 provider volume、备份数据或历史 deployment snapshot。

如果删除被阻塞，先查看 `storage-volumes.show` 的 attachment summary，再显式 detach 对应 Resource。

运行时 volume 清理是单独的 dry-run-first 操作 `storage-volumes.cleanup-runtime`。先预览：

```bash title="预览运行时清理"
appaloft storage volume cleanup-runtime vol_uploads --server srv_primary --before 2026-01-01T00:00:00.000Z
```

破坏性清理必须显式传 `--dry-run false`。当前实现只检查 local-shell 或 generic-SSH server 上选中
Appaloft-owned Docker named volume，并会保留有 active runtime、attachment、snapshot、rollback
candidate、backup retention 或 in-flight backup/restore safety evidence 的候选项；不会删除
bind-mount source path、provider-native storage handle、备份数据或 broad Docker prune 目标，也不能由
`storage-volumes.delete` 隐式触发，不能混进 `servers.capacity.prune`。Docker Swarm Compose stack
的 storage mount realization 发生在 deployment execution 里：Appaloft 会为明确 target service 的
Compose workload 生成 stack override，部署候选 stack，验证后再清理 superseded Appaloft stack/service。

<h2 id="storage-volume-surfaces">入口差异</h2>

CLI 适合创建、查看、重命名、删除和 attach/detach。HTTP API 使用相同 command/query schema。
Web Resource detail 的 Storage 区域可以列出当前项目/环境下可用的 storage volumes，展示安全的
attachment summaries，创建、重命名、删除 provider-neutral storage volume 记录，并把 storage
attach/detach 到 Resource profile。Web 也可以对一个 storage volume 和一个 server 执行 dry-run-first
runtime cleanup：先预览候选项和 blocker，再通过确认操作发送破坏性清理。Web 仍不会
provider-provision storage volume，也不会执行 broad Docker prune。
