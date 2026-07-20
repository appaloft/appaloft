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
  - storage-volumes.backup-plan
  - storage-volumes.create-backup
  - storage-volumes.list-backups
  - storage-volumes.show-backup
  - storage-volumes.restore-plan
  - storage-volumes.restore-backup
  - storage-volumes.prune-backups
  - storage-volumes.backup-policies.configure
  - storage-volumes.backup-policies.list
  - storage-volumes.backup-policies.show
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

<h2 id="storage-volume-backup-restore">Storage volume 备份和恢复</h2>

Storage volume backup 用来保护挂载在 Resource 上的应用数据，例如 PocketBase 的 `/pb_data`、
上传目录、JSON 文件或 SQLite 文件。它不是 DependencyResource backup：Postgres、Redis 这类服务依赖
继续走 `dependency-resources.*`，而 volume 上的 SQLite/application files 走 `storage-volumes.*`
backup/restore。

备份先预览再执行。预览会选择 source adapter 和 target provider，返回一致性、local-only 提示、
retention 影响和 blocker；没有安全 adapter/provider 时会 fail closed，不会退回到 live file copy：

```bash title="预览 volume 备份"
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

如果 plan 没有 blocker，再创建备份：

```bash title="创建 volume 备份"
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

查看、恢复和清理 restore point：

```bash title="管理 volume restore points"
appaloft storage volume backup list --storage-volume vol_uploads
appaloft storage volume backup show svb_123
appaloft storage volume backup restore-plan svb_123
appaloft storage volume backup restore svb_123 --restored-volume-name pb-data-restored
appaloft storage volume backup prune svb_123
```

可以用 policy 自动执行同一条安全的 plan/create/verify/prune 链路。Scheduled policy 使用 lease
claim，多副本 backend 不会并发执行同一个到期备份。Pre-deploy policy 会在部署准入检查之后、创建
deployment 状态之前执行；`block` 会在备份失败时阻止部署，`continue` 则记录失败、发送通知并继续。

```bash title="配置定时和部署前备份"
appaloft storage volume backup policy configure \
  --storage-volume vol_uploads \
  --scheduled true \
  --pre-deploy true \
  --schedule-interval-hours 24 \
  --failure-mode block \
  --retry-on-failure true \
  --notification-ref conn_ops \
  --target-provider s3-compatible \
  --target-ref s3://backups/appaloft/vol_uploads \
  --secret-ref sec_s3_backup \
  --retention-max-count 14 \
  --retention-max-age-days 30

appaloft storage volume backup policy list --storage-volume vol_uploads
appaloft storage volume backup policy show svbp_123
```

Scheduler 会先验证新备份的 checksum，再应用数量、时长和字节数 retention。失败 attempt 会保留在
policy readback，并可通过配置的 connector 发出通知。用
`APPALOFT_SCHEDULED_STORAGE_VOLUME_BACKUP_RUNNER_ENABLED=true` 启用 worker；轮询间隔和 claim batch
分别由 `APPALOFT_SCHEDULED_STORAGE_VOLUME_BACKUP_RUNNER_INTERVAL_SECONDS` 和
`APPALOFT_SCHEDULED_STORAGE_VOLUME_BACKUP_RUNNER_BATCH_SIZE` 控制。

默认恢复到新的 StorageVolume。把恢复出来的新 volume 挂回 Resource 或替换现有 mount，是单独的显式
operator 操作。Local filesystem target 只能说明本机/同 failure domain 有一份恢复点，不能当作灾备。
Public Appaloft 已提供 S3-compatible runtime target，但 distribution 必须显式注册短期 object-transfer
broker、安全的 bucket/key policy 和 credential reference 后才会启用；长期对象存储凭据不会下发到
workload server，也不会进入 backup readback。WebDAV、Restic repository 和 provider snapshot 仍需要
各自的 distribution/runtime adapter。

<h2 id="storage-volume-surfaces">入口差异</h2>

CLI 适合创建、查看、重命名、删除和 attach/detach。HTTP API 使用相同 command/query schema。
Web Resource detail 的 Storage 区域可以列出当前项目/环境下可用的 storage volumes，展示安全的
attachment summaries，创建、重命名、删除 provider-neutral storage volume 记录，并把 storage
attach/detach 到 Resource profile。Web 也可以对一个 storage volume 和一个 server 执行 dry-run-first
runtime cleanup：先预览候选项和 blocker，再通过确认操作发送破坏性清理。Web 的 Storage 设置也可以预览
volume backup、显示 blocker、列出 restore points、恢复到新 volume、清理指定备份。Web 仍不会
provider-provision storage volume，也不会执行 broad Docker prune。
