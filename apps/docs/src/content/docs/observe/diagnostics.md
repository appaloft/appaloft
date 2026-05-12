---
title: "Diagnostics"
description: "复制安全诊断摘要，不暴露 secret。"
docType: troubleshooting
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "diagnostic"
  - "support payload"
  - "secret masking"
  - "诊断"
relatedOperations:
  - resources.diagnostic-summary
  - resources.access-failure-evidence.lookup
  - servers.capacity.inspect
  - servers.capacity.prune
  - scheduled-runtime-prune-policies.configure
  - scheduled-runtime-prune-policies.list
  - scheduled-runtime-prune-policies.show
sidebar:
  label: "Diagnostics"
  order: 4
---

<h2 id="diagnostic-summary-copy-support-payload">复制诊断摘要</h2>

诊断摘要用于支持和排障。它应该包含稳定 ID、状态、错误代码和安全上下文，但必须屏蔽 secret 值。

优先复制 Appaloft 生成的诊断摘要，而不是手动拼日志、环境变量和服务器命令输出。

诊断摘要应该包含：

- project、resource、environment、deployment 等稳定 id。
- 最近失败阶段和错误 code。
- source/runtime/health/network 的安全摘要。
- 服务器和代理 readiness 摘要。
- 访问地址、域名和证书状态。
- 访问失败诊断的 request id、受影响 hostname/path、安全 related ids 和下一步动作。
- 已屏蔽的 secret key 名和是否存在，不包含值。

<h2 id="access-failure-request-id-lookup">用 Request ID 查询访问失败</h2>

如果访问 Appaloft 生成 URL 或自定义域失败，错误页会显示 request id。资源所有者可以用这个
request id 查询短期保留的安全证据：

```bash title="查询访问失败证据"
appaloft resource access-failure req_abc123
```

可以用资源、hostname 或 path 缩小范围：

```bash title="按资源和路径收窄"
appaloft resource access-failure req_abc123 --resource res_web --host web.example.com --path /
```

结果只包含安全 envelope、matched source、related ids、下一步动作、capturedAt 和 expiresAt。
如果证据过期或筛选条件不匹配，Appaloft 返回稳定的 not-found 结果，而不是泄露其他资源信息。
不要把截图、SSH 输出、Traefik 原始日志、cookie、Authorization header 或 provider raw payload
当作诊断证据分享。

<h2 id="runtime-target-capacity-inspect">Runtime target capacity inspect</h2>

当部署因为磁盘、inode、Docker image store 或 build cache 压力失败时，先运行只读容量诊断：

```bash title="只读检查服务器容量"
appaloft server capacity inspect srv_primary
```

这个入口只读取容量信号，不会运行 prune，不会删除 Docker volume，不会删除
`/var/lib/appaloft/runtime/state`，也不会停止容器。输出会包含 disk、inodes、Docker image/build-cache
usage、Appaloft runtime/state/source workspace usage、safe reclaimable estimate 和 warnings。

`safeReclaimableEstimate` 是后续 cleanup/prune 决策的估算输入，不代表 Appaloft 已经执行清理。

如需预览 target-owned 清理，先用 dry-run 运行 prune：

```bash title="Dry-run runtime target prune"
appaloft server capacity prune srv_primary --before 2026-01-01T00:00:00.000Z
```

Docker build cache 和 unused image 清理必须显式选择 category：

```bash title="Dry-run Docker cache and image prune"
appaloft server capacity prune srv_primary --before 2026-01-01T00:00:00.000Z --category docker-build-cache --category unused-images
```

破坏性 prune 仍然需要 `--dry-run false`。这个命令不会运行 broad `docker system prune`，
也不会执行 Docker volume prune；它会保留 Appaloft state roots、active runtimes、rollback
candidates、deployment snapshots、audit/events、logs 和业务状态。

<h2 id="scheduled-runtime-prune-policy">Scheduled runtime prune policy</h2>

scheduled runtime prune policy 用来配置内部 runtime prune scheduler 读取的保留窗口。scheduler
仍然通过和手动 prune 相同的 `servers.capacity.prune` 边界执行清理，所以只有 policy 明确开启时，
才会执行破坏性清理。

用 scope、retention window、target selector 和 cleanup categories 创建或替换 policy：

```bash title="配置 scheduled runtime prune policy"
appaloft server capacity policy configure \
  --scope project \
  --server-id srv_primary \
  --retention-days 14 \
  --category stopped-containers
```

policy 默认 enabled，失败后会 retry，并且因为 `--destructive` 默认为 `false`，scheduler 会以
dry-run 方式运行。只有先通过 dry-run 确认候选项符合预期后，才添加 `--destructive true`。
Docker build cache 和 unused image 清理仍然必须显式选择 category。

查看 scheduler 当前能读取的 policy：

```bash title="列出 scheduled runtime prune policies"
appaloft server capacity policy list --server-id srv_primary --enabled-only true
```

按 id 查看单个 policy，用于审计 scheduler 决策：

```bash title="查看 scheduled runtime prune policy"
appaloft server capacity policy show rtp_primary
```

HTTP API 暴露同一组 command/query surface：`POST /api/servers/capacity/policies`、
`GET /api/servers/capacity/policies` 和 `GET /api/servers/capacity/policies/{policyId}`。
policy readback 是安全输出，只包含 ids、scope、retention days、enabled state、destructive mode、
category names、retry behavior 和 update time，不包含 runtime command output 或 secrets。

policy precedence 沿用 Appaloft 配置优先级：

```text title="Scheduled runtime prune policy precedence"
defaults < system < organization < project < environment < deployment snapshot
```

已配置的 policy 可以使用 `deployment-snapshot` scope。repository 或 deployment-snapshot
configuration 还不会自动创建这些 policy 记录，所以需要通过 policy command 或 API 创建。用
operator work 查看已接受的 scheduled prune attempt 和失败状态。

<h2 id="diagnostic-secret-masking">Secret 屏蔽</h2>

不要复制私钥、完整环境变量值、令牌或用户数据库连接串。优先使用 Appaloft 生成的安全摘要。

绝对不要分享：

- SSH private key。
- API token 或 session token。
- 数据库连接串。
- `.env` 文件全文。
- 证书 private key。
- 完整服务器 shell history。

<h2 id="diagnostic-when-to-copy">什么时候复制诊断摘要</h2>

适合复制：

- 部署失败但错误提示不够明确。
- 默认访问地址、域名或 TLS 状态不一致。
- 健康检查和运行时日志互相矛盾。
- 需要把问题交给团队成员或支持人员。

复制前先确认摘要里没有 secret 值。如果必须附加日志，只截取相关时间窗口，并检查是否包含敏感值。

CLI 示例：

```bash title="复制支持安全的诊断摘要"
appaloft resource diagnose res_web \
  --deployment dep_123 \
  --deployment-logs \
  --runtime-logs \
  --tail 50
```

诊断摘要形状示例：

```json title="Safe diagnostic payload"
{
  "resourceId": "res_web",
  "deploymentId": "dep_123",
  "failedPhase": "verify",
  "errorCode": "health_check_failed",
  "accessFailure": {
    "requestId": "req_abc123",
    "code": "resource_access_upstream_timeout",
    "affected": { "hostname": "web.example.com", "path": "/" },
    "nextAction": "check-health"
  },
  "secrets": [
    { "key": "DATABASE_URL", "value": "***" }
  ],
  "nextAction": "Check health path and runtime logs."
}
```
