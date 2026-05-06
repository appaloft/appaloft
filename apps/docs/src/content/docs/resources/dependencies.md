---
title: "Dependency resources"
description: "管理 Postgres、Redis、绑定、secret 轮换和备份恢复。"
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
  - dependency-resources.provision-postgres
  - dependency-resources.import-postgres
  - dependency-resources.provision-redis
  - dependency-resources.import-redis
  - dependency-resources.list
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
Postgres 和 Redis 记录、Appaloft-managed Postgres realization、外部依赖导入、安全 read model、
删除安全检查，以及备份恢复。

```bash title="创建或导入依赖资源"
appaloft dependency postgres provision --project prj_prod --environment env_prod --name app-db
appaloft dependency redis import --project prj_prod --environment env_prod --name cache
```

List/show 输出必须屏蔽连接 secret、provider token、密码和原始连接字符串。

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
ready、缺少安全 secret reference、不支持的 dependency kind、不支持的 scope 或 injection mode、重复的
target name、已有环境变量冲突，或 runtime target 无法交付依赖 secret。

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

恢复不会修改 ResourceBindings、deployment rollback/redeploy 状态、运行时进程或历史 deployment snapshot。
如果有保留中的 backup 或 in-flight restore，dependency delete 必须被阻塞。

<h2 id="dependency-delete-safety">删除安全</h2>

删除 dependency resource 前，Appaloft 会检查活动 binding、backup retention、deployment snapshot
引用和 provider-managed 安全状态。Imported external delete 只删除 Appaloft 控制面记录，不删除外部数据库。

被阻塞时，先查看 dependency detail、binding list 和 backup list，再显式清理对应引用。
