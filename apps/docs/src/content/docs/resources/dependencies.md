---
title: "Dependency resources"
description: "管理依赖资源、绑定、secret 轮换和备份恢复。"
docType: task
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "dependency"
  - "postgres"
  - "redis"
  - "backup"
  - "binding"
  - "runtime injection"
  - "DATABASE_URL"
  - "依赖资源"
relatedOperations:
  - blueprints.list
  - blueprints.show
  - blueprints.plan-install
  - blueprints.install
  - blueprints.installation.show
  - dependency-resources.provision
  - dependency-resources.import
  - dependency-resources.provisioning.plan
  - dependency-resources.provisioning.accept
  - dependency-resources.provisioning.status
  - dependency-resources.list
  - dependency-resources.count
  - dependency-resources.show
  - dependency-resources.rename
  - dependency-resources.delete
  - dependency-resources.create-backup
  - dependency-resources.list-backups
  - dependency-resources.show-backup
  - dependency-resources.restore-backup
  - resources.bind-dependency
  - resources.unbind-dependency
  - resources.rotate-dependency-binding-secret
  - resources.list-dependency-bindings
  - resources.show-dependency-binding
sidebar:
  label: "Dependency resources"
  order: 6
---

<h2 id="dependency-resource-lifecycle">依赖资源生命周期</h2>

Dependency resource 是 Appaloft 管理的数据库或服务依赖记录。Phase 7 支持 provider-neutral
Postgres、Redis、MySQL、ClickHouse、S3/MinIO object storage 和 OpenSearch 记录、
Appaloft-managed realization、外部依赖导入、安全 read model、删除安全检查，以及备份恢复。

```bash title="创建或导入依赖资源"
appaloft dependency provision --kind postgres --project prj_prod --environment env_prod --name app-db
appaloft dependency import --kind redis --project prj_prod --environment env_prod --name cache --connection-url redis://cache.internal:6379/0
```

List/show 输出必须屏蔽连接 secret、provider token、密码和原始连接字符串。

<h2 id="blueprint-dependency-contract">Blueprint 依赖协议</h2>

Blueprint `resources` 用中性的 dependency contract 描述依赖要求。`kind` 表示可移植的供给与绑定
primitive，`engine.family` 表示具体引擎族，`version` 表示 preferred version 或 range，`capabilities`
表示 Postgres extension 等能力要求，`outputs` 表示 `host`、`port`、`database`、`username`、
`password`、`url` 等安全字段名，`readiness` 表示协议级 readiness gate。

组件通过 `dependencyEnv` 消费依赖输出。Plan 只记录环境变量名、output 字段名或 template，以及结果是否为
secret；不会保存真实密码或连接串。包含密码的 `url` 或 template 结果必须按 secret 处理，即使作者省略或弱化了
`secret` 标记。

MariaDB 使用 `kind: mysql` + `engine.family: mariadb`。这样 dependency 仍保持 MySQL-compatible 的供给和绑定
primitive，同时由 engine family 决定 provider 选择、readiness、version matching 和输出语义。

<h2 id="blueprint-catalog-installation">Blueprint catalog 和安装</h2>

Blueprint catalog 是中性的 Blueprint 发现和安装入口，不等同于 Cloud marketplace 策略。List/show 只展示
portable manifest、组件、dependency requirements、storage requirements 和 safe metadata；install plan
会预览 Resource、DependencyResource、StorageVolume、绑定和部署意图；install 接受计划后创建对应资源。

```bash title="查看和安装 Blueprint"
appaloft blueprint list
appaloft blueprint show pocketbase
appaloft blueprint plan-install pocketbase
appaloft blueprint install pocketbase
appaloft blueprint installation show app_123
```

Application bundle readback 必须把 dependency bindings 和 storage bindings 分开展示。数据库、Redis、
object storage、OpenSearch 等服务依赖走 DependencyResource；PocketBase SQLite 文件、uploads、
模型缓存和其他 mounted application data 走 StorageVolume。Blueprint 安装不能把 volume 当成依赖资源，也不能
通过 dependency backup/restore 处理 volume 数据。

<h2 id="dependency-resource-binding">绑定到 Resource</h2>

Resource dependency binding 让后续 deployment snapshot 引用一个依赖资源。绑定只保存 provider-neutral
安全元数据和 secret reference，不会把数据库 URL 或密码写进 Resource，也不需要把数据库 URL 传给
`deployments.create`。

```bash title="绑定依赖资源"
appaloft resource dependency bind res_web --dependency dep_db --target DATABASE_URL
```

Unbind 只移除绑定关系，不删除数据库、不重启运行时、不改写历史 deployment snapshot。

<h2 id="dependency-runtime-injection">部署已绑定的依赖</h2>

当 Resource 有 active ready 的 dependency binding 时，Appaloft 会在 deployment plan 和 deployment
detail 输出中包含安全的 runtime injection readiness。依赖处于 ready 状态、binding 目标是
`DATABASE_URL` 或 `REDIS_URL` 这样的运行时环境变量，并且所选 runtime target 支持依赖 secret
delivery 时，binding 才能被交付。

```bash title="部署前预览依赖 runtime injection"
appaloft deployments plan --project prj_prod --environment env_prod --resource res_web --server srv_prod
appaloft deployments show dep_123
```

`deployments.create` 不接收依赖连接字符串。Appaloft 会在 deployment snapshot 中捕获当前安全的
binding reference，并要求 runtime target 向 workload 提供配置好的环境变量。后续 binding secret
轮换不会改写历史 deployment snapshot 中已捕获的 reference。

<h2 id="dependency-runtime-injection-blocked">Runtime injection 被阻塞</h2>

Plan 和 show 输出会把 dependency runtime injection 标记为 `ready`、`blocked` 或 `not-applicable`。
`blocked` 表示至少一个 active binding 无法被所选 runtime target 安全交付。常见安全原因包括依赖还未
ready、缺少安全 secret reference、已存储的依赖 secret 无法解析、不支持的 dependency kind、不支持的
scope 或 injection mode、重复的 target name、已有环境变量冲突，或 runtime target 无法交付依赖
secret。

当 `deployments.create` 看到同样的 blocked 状态时，会在接受部署前以
`dependency_runtime_injection_blocked` 拒绝请求。不会创建 deployment attempt，响应也不会暴露原始连接
字符串、密码或 provider payload。修复 dependency resource、binding、target name 或 runtime target
后，再重新运行 plan。

<h2 id="dependency-secret-rotation">Binding secret 轮换</h2>

`resources.rotate-dependency-binding-secret` 只替换绑定上的安全 secret reference 或版本。它影响未来
deployment snapshot，不会修改 provider-native 数据库密码、运行中的容器环境变量或历史部署。

轮换后应创建新的部署，让 workload 读取新的快照引用。

<h2 id="dependency-backup-restore">备份和恢复</h2>

Backup 会创建 safe restore point；restore 会在明确确认数据覆盖和 runtime 不会自动重启后，对同一个
dependency resource 执行 in-place restore。

```bash title="备份和恢复"
appaloft dependency backup create dep_db
appaloft dependency backup list dep_db
appaloft dependency backup restore bkp_123
```

对于带有 Appaloft-owned connection reference 的 imported dependency，shell provider 会执行 native
Postgres dump/restore 或 Redis logical backup/restore。Provider-owned 或无法解析的 reference 仍会生成
安全的 metadata-only restore point，直到对应 provider 提供自己的 backup substrate。原始连接值不会出现在
backup artifact、read model、event 或 error 里。

恢复不会修改 ResourceBindings、deployment rollback/redeploy 状态、运行时进程或历史 deployment snapshot。
如果有保留中的 backup 或 in-flight restore，dependency delete 必须被阻塞。

Scheduled backup policy 是显式启用的策略记录。除非 self-hosted shell 启用了 scheduled dependency
backup runner，否则策略不会执行。到期策略会调度和手动备份相同的
`dependency-resources.create-backup` 操作，并记录安全的 process attempt 元数据供 operator 审查。

```bash title="配置定时依赖备份"
appaloft dependency backup policy configure dep_db --retention-days 7 --interval-hours 24
appaloft dependency backup policy list dep_db
appaloft dependency backup policy show dbp_123
```

<h2 id="dependency-delete-safety">删除安全</h2>

删除 dependency resource 前，Appaloft 会检查活动 binding、backup retention、deployment snapshot
引用和 provider-managed 安全状态。Imported external delete 只删除 Appaloft 控制面记录，不删除外部数据库。

被阻塞时，先查看 dependency detail、binding list 和 backup list，再显式清理对应引用。
