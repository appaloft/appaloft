---
title: "Deployment recovery"
description: "重新关联来源、清理 preview 部署，并决定重试、修复或回滚。"
docType: troubleshooting
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "relink"
  - "preview cleanup"
  - "retry"
  - "cancel"
  - "rollback"
  - "恢复"
relatedOperations:
  - deployments.recovery-readiness
  - deployments.retry
  - deployments.redeploy
  - deployments.rollback
  - deployments.cancel
  - deployments.stale-attempts
  - deployments.reconcile-stale
  - deployments.archive
  - deployments.prune
  - source-links.relink
  - deployments.cleanup-preview
sidebar:
  label: "Recovery"
  order: 4
---

<h2 id="deployment-source-relink">重新关联部署来源</h2>

当资源或部署记录指向的来源不再可访问，或者用户需要把资源切换到新的仓库、路径或镜像时，source relink 是显式恢复动作。

执行前确认目标资源、当前来源、新来源和预期环境。执行后通过下一次部署或资源详情确认 Appaloft 读取的是新的来源。

不要把 relink 当成普通重试。Relink 会改变后续部署读取的 source，适合处理仓库迁移、目录重组、镜像来源变化或本地 source 指纹失效。

<h2 id="deployment-preview-cleanup">清理 Preview 部署</h2>

Preview cleanup 用于删除某个 pull request、分支或临时来源产生的预览部署。清理对象必须由 preview 类型和 preview id 定位，不能误删生产环境或普通部署历史。

清理后应检查：

- 预览部署实例是否停止。
- 预览访问地址是否不再展示为有效入口。
- 生产部署和普通历史记录是否未被影响。
- 后续同一 preview id 是否可以重新创建。

<h2 id="deployment-recovery-readiness">检查部署恢复就绪</h2>

当部署失败、被取消或观察流中断时，先读取恢复就绪，而不是直接执行重试或回滚：

```bash
appaloft deployments recovery-readiness <deploymentId>
```

这个查询只读。它会返回：

- `recoverable`、`retryable`、`redeployable`、`rollbackReady` 等机器可读字段。
- `retry`、`redeploy`、`rollback` 三类动作的阻塞原因，以及 active attempt 是否适合取消的上下文。
- 可用的 rollback candidates，以及候选是否缺少 artifact 或快照。
- 安全的下一步建议，例如查看详情、日志、事件流或诊断摘要。

当前 `retry`、`redeploy`、`rollback` 和 active-attempt `cancel` 写命令已启用。当 readiness 返回缺少快照、缺少 artifact、readiness 过期、运行时正在被占用或候选不兼容时，恢复命令仍会被阻塞。

<h2 id="agent-deploy-recovery">Agent 部署恢复</h2>

Agent 不应该在失败后直接重试。它应先读取 recovery readiness，并把阻塞原因、可用候选和安全下一步返回给用户。只有 readiness 明确允许时，才建议 retry、redeploy 或 rollback。

如果 readiness 要求先看日志或诊断摘要，agent 应返回对应命令，而不是直接修改运行时、远端状态或 secret。

<h2 id="deployment-recovery-retry">Retry</h2>

Retry 的语义是“基于失败部署的不可变 snapshot intent 创建新的部署 attempt”。它不是重放旧事件，也不是在旧 attempt 中继续执行失败阶段。

检查 readiness 后，可以运行 `appaloft deployments retry <deploymentId>`，或调用 `POST /api/deployments/{deploymentId}/retry`。

<h2 id="deployment-recovery-redeploy">Redeploy</h2>

Redeploy 的语义是“使用当前 Resource profile 再部署一次”。它会读取当前资源配置、环境配置、target 和 destination，不复用旧部署快照。

如果当前 Resource profile 缺失、漂移或不再能通过 admission，readiness 会把 redeploy 标记为阻塞。

检查 readiness 后，可以运行 `appaloft deployments redeploy <resourceId>`，或调用 `POST /api/resources/{resourceId}/redeploy`。

<h2 id="deployment-recovery-force-redeploy">Force redeploy</h2>

Force redeploy 的语义是“使用当前 Resource profile 再部署一次，并强制刷新 runtime artifact”。Docker build 会使用 pull/no-cache 行为；Compose build 会先执行强制 build；prebuilt image 会显式拉取镜像。

它不会修改 Resource profile，也不会在保存变量后自动部署。可以运行 `appaloft deployments force-redeploy <resourceId>`，或调用 `POST /api/resources/{resourceId}/force-redeploy`。

<h2 id="deployment-recovery-rollback">Rollback</h2>

Rollback 的语义是“基于历史成功部署的 snapshot 和 Docker/OCI artifact 创建新的 rollback attempt”。它不会从当前 Resource profile 重新 plan，也不会恢复数据库、volume、队列或外部依赖状态。

检查 readiness 并选择 rollback-ready candidate 后，可以运行 `appaloft deployments rollback <deploymentId> --candidate <candidateDeploymentId>`，或调用 `POST /api/deployments/{deploymentId}/rollback`。

<h2 id="deployment-recovery-cancel">Cancel</h2>

Cancel 用于停止一个尚未完成的 deployment attempt。它不会删除部署历史、日志、事件、runtime artifact、route intent、Resource 或环境配置。

运行 `appaloft deployments cancel <deploymentId> --confirm <deploymentId>`，或调用 `POST /api/deployments/{deploymentId}/cancel`。`--confirm` 必须和 deployment id 完全一致；已经成功、失败、取消或回滚的 terminal attempt 会被拒绝。

<h2 id="deployment-recovery-stale-attempts">处理长时间无活动的 attempt</h2>

当部署长时间停在 created、planning、planned、running 或 cancel-requested 时，先运行
`appaloft deployments stale --stale-after-seconds 900`。查询只根据 durable deployment
timeline 和状态判断候选，不会因为浏览器断开或日志流中断而修改部署。

确认 attempt 确实失去执行所有权后，使用查询返回的 `stateVersion`：

```bash
appaloft deployments reconcile-stale <deploymentId> \
  --state-version <stateVersion> \
  --stale-after-seconds 900 \
  --confirm <deploymentId>
```

命令会在协调锁内重新读取状态。期间出现新活动、状态发生变化、阈值不再满足，或 attempt
已经终结时，命令会拒绝执行。成功后旧 attempt 变为 `interrupted`，历史和恢复证据仍然
保留；需要继续部署时再通过 recovery readiness 选择 retry 或 redeploy。

<h2 id="deployment-recovery-archive-prune">归档和清理 attempt</h2>

Archive 会把一个 terminal deployment attempt 从默认历史列表隐藏起来，但不会删除日志、事件、runtime artifact、provider job log、audit row、route state、rollback candidate 或 operator-work evidence。运行 `appaloft deployments archive <deploymentId> --confirm <deploymentId>`，或调用 `POST /api/deployments/{deploymentId}/archive`。

Prune 默认只是 dry-run。运行 `appaloft deployments prune --before <iso>`，或调用 `POST /api/deployments/prune`。破坏性清理必须显式传入 `dryRun: false`，并且只会删除早于 cutoff、已经归档、处于 terminal 状态、且没有 source/retry/rollback/supersede/provider-log/runtime-log/runtime-control 保留引用的 attempt。

<h2 id="deployment-recovery-rollback-candidates">Rollback candidates</h2>

rollback candidate 必须是同一资源下的历史成功部署，并且仍保留必要信息：

- deployment snapshot；
- environment snapshot；
- runtime target / destination identity；
- Docker/OCI artifact identity，例如 image、digest、local image id 或 Compose artifact。

如果 artifact 已被清理、快照不完整、target 不兼容，或恢复需要数据/volume 回滚，readiness 会返回阻塞原因并建议改选候选、重新部署或先做诊断。

<h2 id="deployment-retry-or-rollback">重试还是回滚</h2>

输入校验失败应先修正输入。执行阶段临时失败可以重试。verify 失败要先看健康摘要和日志，再决定修复配置、重试或回滚。

推荐判断：

| 现象 | 优先动作 |
| --- | --- |
| source 无法读取 | 修 source 或 relink。 |
| runtime/profile 不匹配 | 修资源 profile 后重新部署。 |
| SSH 或服务器执行失败 | 运行连接测试，查看服务器诊断。 |
| 应用启动但健康检查失败 | 查看日志和 health profile。 |
| 默认访问地址失败 | 查看 proxy readiness 和 network profile。 |
| 自定义域名失败 | 先验证默认访问地址，再看 DNS/TLS。 |

<h2 id="deployment-recovery-surfaces">入口差异</h2>

Web console 会把恢复动作放在部署状态附近。CLI 适合 preview cleanup、source relink、retry、redeploy、rollback 和 cancel。HTTP API 应暴露可机器判断的状态、错误 code 和恢复建议。

恢复动作不应该要求用户直接修改数据库或手动删除运行时状态。
