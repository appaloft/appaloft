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
- 已屏蔽的 secret key 名和是否存在，不包含值。

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
  "secrets": [
    { "key": "DATABASE_URL", "value": "***" }
  ],
  "nextAction": "Check health path and runtime logs."
}
```
