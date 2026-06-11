---
title: "Configuration reference"
description: "入口、环境变量和静态资源覆盖参考。"
docType: reference
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "configuration"
  - "environment variable"
  - "static assets"
  - "scheduled retention"
  - "scheduler"
  - "配置"
relatedOperations: []
sidebar:
  label: "Configuration"
  order: 5
---

<h2 id="reference-runtime-configuration">运行时配置</h2>

运行时配置控制 Appaloft serve、数据库、静态资源目录和自托管行为。

<h2 id="reference-docs-static-dir">Docs 静态资源目录</h2>

`APPALOFT_DOCS_STATIC_DIR` 覆盖 public docs 静态资源，不覆盖 Web console。

<h2 id="reference-durable-worker-runtime">Durable worker runtime</h2>

Durable worker runtime 配置控制已经 accepted 的长耗时工作在请求返回 id 之后如何被 claim、执行和监控。
默认 `embedded` 模式会随 `appaloft serve` 一起启动 worker slots，降低自托管部署难度。operator 也可以运行
`appaloft worker` 启动专用 worker 进程；Cloud 这类部署可以配置多个 standalone workers，共享同一个
durable queue backend。

默认 queue backend 是 `database`，使用专门的 durable work item 和 event 表作为 durable state
authority。Temporal、Kafka 或其他外部 workflow engine 必须通过 adapter 接入，并继续为
`operator-work.*` query 投影安全的 durable-work 和 process-attempt 进度。

`appaloft doctor`、`GET /api/system/doctor` 和 Web Instance 页面会报告配置的 mode、queue backend、
worker group、worker ids 和 coordinator role。Web/API 进程不执行 durable work 时，也可以通过
`APPALOFT_WORKER_OBSERVED_GROUPS` 观测独立 worker group。

| 变量 | 默认值 | 含义 |
| --- | --- | --- |
| `APPALOFT_WORKER_RUNTIME_MODE` | `embedded` | `embedded` 随 `appaloft serve` 启动 worker slots；`standalone` 预期由专用 `appaloft worker` 进程启动；`disabled` 不启动 durable work slots。 |
| `APPALOFT_WORKER_QUEUE_BACKEND` | `database` | Durable queue backend。`database` 使用 process-attempt journal；`external` 需要 adapter kind。 |
| `APPALOFT_WORKER_COUNT` | `1` | 配置的 worker slots 数。启用模式至少需要 1 个；`disabled` 可设为 `0`。 |
| `APPALOFT_WORKER_GROUP` | `appaloft-worker` | 稳定 worker group，用来生成 worker ids 并协调容量。 |
| `APPALOFT_WORKER_EXTERNAL_BACKEND_KIND` | unset | `APPALOFT_WORKER_QUEUE_BACKEND=external` 时必填；public 支持值为 `kafka`、`temporal`、`custom`。 |
| `APPALOFT_WORKER_OBSERVED_GROUPS` | unset | 逗号分隔的 `worker-group:count` 列表。doctor 和 Web Instance 页面会从 durable worker 心跳 read model 读取这些 group，即使当前 Web/API 进程配置为 `APPALOFT_WORKER_RUNTIME_MODE=disabled`。 |
| `APPALOFT_DATABASE_POOL_MAX` | `10` | PostgreSQL runtime 每个进程最多保留的连接数。多 Web/worker 进程共享较小 session pool 时应按进程数降低这个值。 |

<h2 id="reference-scheduled-workers">Scheduled workers</h2>

除非另有说明，scheduled worker 默认关闭。只在应拥有周期性工作的实例上启用它们。

certificate retry scheduler 是默认开启的例外，因为它只处理已经 accepted、随后进入 retry-scheduled
状态的 managed certificate work。Runtime execution、runtime prune、history retention、monitoring
collection 和 preview cleanup worker 都保持默认关闭，直到 operator 显式启用对应的
`APPALOFT_*_ENABLED` 设置。

这些 runner 不会在 Appaloft 状态之外发现新工作。它们只会处理已经到期的 task runs、显式 runtime prune
policies、retention defaults、已存在运行时归属的 monitoring targets、已经过期且仍 active 的 preview
environments，或已经记录为 retry-scheduled 的 cleanup attempts。

`appaloft doctor`、`GET /api/system/doctor` 和 Web Instance 页面会报告这些 worker 的配置激活状态、
间隔、batch 设置和安全模式，但不会启动或 tick 它们。

| 变量 | 默认值 | 含义 |
| --- | --- | --- |
| `APPALOFT_CERTIFICATE_RETRY_SCHEDULER_ENABLED` | `true` | 重试已经 accepted、随后进入 retry-scheduled 状态的 managed certificate 签发/续期 attempt。 |
| `APPALOFT_CERTIFICATE_RETRY_SCHEDULER_INTERVAL_SECONDS` | `300` | certificate retry 轮询间隔。 |
| `APPALOFT_CERTIFICATE_RETRY_DEFAULT_DELAY_SECONDS` | `300` | retryable certificate work 再次重试前的默认延迟。 |
| `APPALOFT_CERTIFICATE_RETRY_SCHEDULER_BATCH_SIZE` | `25` | 每次 tick 最多扫描的 certificate retry attempts。 |
| `APPALOFT_SCHEDULED_TASK_RUNNER_ENABLED` | `false` | 运行到期的 Resource scheduled tasks。 |
| `APPALOFT_SCHEDULED_TASK_RUNNER_INTERVAL_SECONDS` | `60` | scheduled task 轮询间隔。 |
| `APPALOFT_SCHEDULED_TASK_RUNNER_BATCH_SIZE` | `25` | 每次 tick 最多扫描的 scheduled task attempts。 |
| `APPALOFT_SCHEDULED_RUNTIME_PRUNE_RUNNER_ENABLED` | `false` | 运行 scheduled runtime capacity prune policies。 |
| `APPALOFT_SCHEDULED_RUNTIME_PRUNE_RUNNER_INTERVAL_SECONDS` | `3600` | runtime capacity prune 轮询间隔。 |
| `APPALOFT_SCHEDULED_RUNTIME_PRUNE_RUNNER_BATCH_SIZE` | `25` | 每次 tick 最多扫描的 runtime prune policies。 |
| `APPALOFT_SCHEDULED_DEPENDENCY_BACKUP_RUNNER_ENABLED` | `false` | 运行 scheduled dependency backup policies。 |
| `APPALOFT_SCHEDULED_DEPENDENCY_BACKUP_RUNNER_INTERVAL_SECONDS` | `3600` | dependency backup policy 轮询间隔。 |
| `APPALOFT_SCHEDULED_DEPENDENCY_BACKUP_RUNNER_BATCH_SIZE` | `25` | 每次 tick 最多扫描的 dependency backup policies。 |
| `APPALOFT_SCHEDULED_HISTORY_RETENTION_RUNNER_ENABLED` | `false` | 通过已有 history prune commands 或受治理的 retention stores 运行 retention defaults。 |
| `APPALOFT_SCHEDULED_HISTORY_RETENTION_RUNNER_INTERVAL_SECONDS` | `3600` | scheduled history retention 轮询间隔。 |
| `APPALOFT_SCHEDULED_HISTORY_RETENTION_RUNNER_BATCH_SIZE` | `25` | 每次 tick 最多扫描的 retention default policies。 |
| `APPALOFT_RUNTIME_MONITORING_COLLECTOR_RUNNER_ENABLED` | `false` | 运行 retained runtime monitoring sample 采集；当前按 active servers 和已有 runtime-owning resources/deployments/projects/environments 采集。 |
| `APPALOFT_RUNTIME_MONITORING_COLLECTOR_RUNNER_INTERVAL_SECONDS` | `60` | runtime monitoring collector 轮询间隔。 |
| `APPALOFT_RUNTIME_MONITORING_COLLECTOR_RUNNER_BATCH_SIZE` | `25` | 每次 tick 最多采集的 runtime monitoring targets。 |
| `APPALOFT_TERMINAL_SESSION_ACTIVE_TTL_SECONDS` | `3600` | `terminal-session expire` 未传明确 cutoff 时使用的、会随输入/resize/输出刷新的 active terminal session 年龄上限。 |
| `APPALOFT_TERMINAL_SESSION_OUTPUT_RETENTION_BYTES` | `65536` | active terminal transport 重连时只在内存中回放的有界终端输出尾部；设为 `0` 可关闭回放。 |
| `APPALOFT_BETTER_AUTH_COOKIE_DOMAIN` | unset | 可选 Better Auth cookie domain；需要跨同一 site 的多个子域共享 product session 时设置，例如 `.example.com`。 |
| `APPALOFT_BETTER_AUTH_COOKIE_PREFIX` | Better Auth 默认值 | 可选 Better Auth cookie prefix；多个 Appaloft origin 共享 session 时应保持一致。 |
| `APPALOFT_BETTER_AUTH_TRUSTED_PROXY_HEADERS` | `false` | 在受信任反向代理后运行时，允许 Better Auth 读取 proxy headers 还原外部 origin。 |
| `APPALOFT_GITHUB_CLIENT_ID` | unset | 可选 GitHub OAuth App client id；与 `APPALOFT_GITHUB_CLIENT_SECRET` 一起配置后，登录和注册页面会显示 GitHub 登录。 |
| `APPALOFT_GITHUB_CLIENT_SECRET` | unset | 可选 GitHub OAuth App client secret；必须通过 secret store/env 注入，不能写入仓库。 |
| `APPALOFT_GITHUB_REDIRECT_URI` | `<APPALOFT_BETTER_AUTH_URL>/api/auth/callback/github` | 可选 GitHub OAuth callback 覆盖值；大多数部署只需要把 GitHub OAuth App callback 设置成默认值。 |
| `APPALOFT_RUNTIME_MONITORING_RAW_RETENTION_HOURS` | `24` | retained monitoring raw samples 的默认保留小时数。 |
| `APPALOFT_REMOTE_PGLITE_SYNC_BACKUP_RETENTION_DAYS` | `7` | SSH remote PGlite `state/backups/sync-*` upload backups 的恢复窗口。 |
| `APPALOFT_REMOTE_PGLITE_SYNC_BACKUP_MAX_COUNT` | `20` | SSH remote PGlite `state/backups/sync-*` upload backups 的数量上限；超过上限时保留最新备份。 |
| `APPALOFT_PREVIEW_EXPIRY_CLEANUP_SCHEDULER_ENABLED` | `false` | 扫描已过期且仍 active 的 preview environments，并通过 preview cleanup 边界发起清理。 |
| `APPALOFT_PREVIEW_EXPIRY_CLEANUP_SCHEDULER_INTERVAL_SECONDS` | `300` | expired preview cleanup scan 轮询间隔。 |
| `APPALOFT_PREVIEW_EXPIRY_CLEANUP_SCHEDULER_BATCH_SIZE` | `25` | 每次 tick 最多扫描的 expired active preview environments。 |
| `APPALOFT_PREVIEW_CLEANUP_RETRY_SCHEDULER_ENABLED` | `false` | 重试已记录为 retry-scheduled 的 preview cleanup attempts。 |
| `APPALOFT_PREVIEW_CLEANUP_RETRY_SCHEDULER_INTERVAL_SECONDS` | `300` | preview cleanup retry 轮询间隔。 |
| `APPALOFT_PREVIEW_CLEANUP_RETRY_SCHEDULER_BATCH_SIZE` | `25` | 每次 tick 最多扫描的 preview cleanup retry attempts。 |
