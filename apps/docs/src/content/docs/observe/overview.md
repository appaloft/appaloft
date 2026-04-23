---
title: "Observe and troubleshoot"
description: "查看状态、事件、运行时日志、访问失败和可复制诊断摘要。"
docType: troubleshooting
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "logs"
  - "health"
  - "diagnostic"
  - "troubleshooting"
  - "status"
  - "日志"
  - "诊断"
  - "故障排查"
relatedOperations:
  - resources.health
  - resources.runtime-logs
  - resources.diagnostic-summary
  - deployments.show
sidebar:
  label: "Observe and troubleshoot"
  order: 8
---

<h2 id="observe-status-first">先看状态</h2>

排查时先确认资源、部署、运行时、代理和访问地址各自的状态。不要只根据一个失败提示判断整个部署失败。

<h2 id="observe-runtime-logs">运行时日志</h2>

运行时日志来自应用进程的 stdout/stderr。日志适合判断应用启动失败、端口监听错误、配置缺失和运行时异常。

<h2 id="observe-health-summary">健康摘要</h2>

健康摘要把部署、运行时、健康策略、代理和公开访问观察合在一起，帮助用户判断下一步应该重试、修复配置还是回滚。

<h2 id="diagnostic-summary-copy-support-payload">复制诊断摘要</h2>

诊断摘要用于支持和排障。它应该包含稳定 ID、状态、错误代码和安全上下文，但必须屏蔽 secret 值。

<h2 id="observe-safe-recovery">安全恢复</h2>

优先选择可重试操作。只有在状态说明需要人工处理时，才修改服务器、凭据、代理或域名配置。
