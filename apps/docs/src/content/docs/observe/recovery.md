---
title: "Safe recovery"
description: "根据状态、日志和诊断摘要选择重试、修复或回滚。"
docType: troubleshooting
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "recovery"
  - "retry"
  - "rollback"
  - "恢复"
relatedOperations:
  - deployments.create
sidebar:
  label: "Safe recovery"
  order: 5
---

<h2 id="observe-safe-recovery">安全恢复</h2>

优先选择可重试操作。只有在状态说明需要人工处理时，才修改服务器、凭据、代理或域名配置。

<h2 id="observe-retry-policy">重试策略</h2>

临时网络、拉取和执行失败通常可以重试。输入、凭据、DNS 和证书材料问题需要先修复。
