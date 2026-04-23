---
title: "Health and network profiles"
description: "配置健康检查、监听端口和代理目标。"
docType: task
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "health"
  - "readiness"
  - "network"
  - "port"
  - "健康检查"
relatedOperations:
  - resources.configure-health
  - resources.configure-network
sidebar:
  label: "Health and network"
  order: 4
---

<h2 id="resource-health-profile">Health profile</h2>

Health profile 决定 verify 阶段如何判断应用是否可用。它应该和用户真实访问路径保持一致，而不是只检查进程是否存在。

常见字段：

- 健康检查类型，例如 HTTP。
- 检查路径，例如 `/health`。
- 期望状态码。
- interval、timeout、retries 和 start period。

如果没有配置健康检查，Appaloft 可以退回到较弱的运行状态判断，但文档和 UI 应明确这不是完整 readiness。

<h2 id="resource-network-profile">Network profile</h2>

Network profile 描述应用监听端口、协议和代理目标。它回答“代理应该把请求转发到哪里”。

常见字段：

- 应用内部监听端口。
- 协议，例如 HTTP。
- 是否需要代理公开访问。
- 可选的内部 service name 或 target hint。

绑定自定义域名是访问配置，不应该混进基础部署输入。先让 network profile 和默认访问地址可用，再处理域名/TLS。

<h2 id="resource-readiness-failures">Readiness 失败</h2>

如果健康检查失败，先确认应用监听端口、路径、启动耗时和代理目标，再决定重试部署或调整 profile。

排查顺序：

1. 查看 runtime logs，确认应用是否启动。
2. 确认应用实际监听端口。
3. 确认 health path 是否存在并返回期望状态码。
4. 确认 start period 是否足够长。
5. 确认 proxy readiness 和默认访问地址。

<h2 id="resource-health-network-surfaces">入口说明</h2>

Web console 应在资源创建和配置页提供 health/network 字段，并把默认值展示清楚。

CLI 应允许配置 health 和 network profile，并在部署失败时把失败指向对应 profile，而不是只输出 generic failure。

HTTP API 应返回 profile 摘要、最近健康观测和结构化错误。

相关页面：[Generated access routes](/docs/access/generated-routes/) 和 [Logs and health](/docs/observe/logs-health/)。

CLI 示例：

```bash title="配置 HTTP health check"
appaloft resource configure-health res_web \
  --path /health \
  --method GET \
  --expected-status 200 \
  --interval 5 \
  --timeout 5 \
  --retries 10 \
  --start-period 15
```

```bash title="配置 network profile"
appaloft resource configure-network res_web \
  --internal-port 3000 \
  --upstream-protocol http \
  --exposure-mode reverse-proxy
```
