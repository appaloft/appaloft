---
title: "Logs and health"
description: "查看运行时日志和健康摘要。"
docType: troubleshooting
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "logs"
  - "health"
  - "readiness"
  - "日志"
relatedOperations:
  - resources.runtime-logs
  - resources.health
  - resources.runtime.stop
  - resources.runtime.start
  - resources.runtime.restart
sidebar:
  label: "Logs and health"
  order: 3
---

![Diagnostics loop](/docs/diagrams/diagnostics-loop.svg)

<h2 id="observe-runtime-logs">运行时日志</h2>

运行时日志来自应用进程的 stdout/stderr。日志适合判断应用启动失败、端口监听错误、配置缺失和运行时异常。

日志适合回答：

- 应用是否启动。
- 启动命令是否执行。
- 监听端口是否正确。
- 配置或环境变量是否缺失。
- 应用代码是否抛出运行时错误。

日志不适合直接判断域名所有权或证书 readiness。域名和 TLS 问题应看访问状态和证书状态。

<h2 id="observe-health-summary">健康摘要</h2>

健康摘要把部署、运行时、健康策略、代理和公开访问观察合在一起，帮助用户判断下一步应该重试、修复配置还是回滚。

健康摘要应包含：

- 最近部署状态和失败阶段。
- 运行时进程状态。
- 最近一次运行时控制尝试状态（Phase 7 计划能力）。
- health profile 和最近检查结果。
- network profile 和代理目标。
- 默认访问地址状态。
- 自定义域名和 TLS readiness 摘要。

<h2 id="resource-runtime-controls">运行时控制</h2>

运行时控制是 Phase 7 计划能力，用于对一个资源的当前运行时实例执行 stop、start 或 restart。它只改变当前进程或容器状态，不会删除资源、部署历史、存储、依赖绑定、路由、证书、日志或审计数据。

运行时控制可用后，Web、CLI 和 HTTP API 应使用同一组资源级操作：

- `resources.runtime.stop`：停止当前运行时实例。
- `resources.runtime.start`：从保留的安全运行时元数据启动上一次停止的实例。
- `resources.runtime.restart`：对当前运行时执行停止再启动。

运行时控制尝试的最新状态会出现在健康摘要中。没有运行时控制尝试，或功能尚未启用时，健康摘要不会显示这段状态。

<h2 id="runtime-restart-vs-redeploy">Restart 不是 Redeploy</h2>

Restart 不会重新 detect、plan、build、pull artifact，也不会刷新 source、配置、secret、资源 profile、存储挂载、依赖绑定、域名或 TLS 状态。

如果修改了源码、环境变量、secret、runtime profile、network profile、access profile、health profile、存储或依赖绑定，应使用 redeploy、retry、rollback 或 recovery readiness，而不是 restart。

<h2 id="runtime-control-blocked-start">Start 被阻塞时</h2>

Start 只能使用同一资源保留的安全运行时元数据。如果运行时元数据缺失、过期、不安全，资源已归档或删除，已有部署正在修改同一 resource-runtime scope，或当前 profile drift 需要确认，start 会被阻塞。

被阻塞时，应先查看健康摘要中的 blocked reason，再选择：

- 运行 redeploy，让最新 source/config/profile 形成新的部署。
- 查看 recovery readiness，判断 retry、redeploy 或 rollback 是否更合适。
- 查看 runtime logs，确认上一次运行时是否留下可用的应用诊断。

<h2 id="observe-log-health-surfaces">入口说明</h2>

Web console 应把日志和健康摘要放在资源详情或部署详情附近。用户不应该为了判断部署结果去找 raw server logs。

CLI 应提供日志读取和健康摘要命令，适合在 SSH 或 CI 环境中快速排查。

HTTP API 应返回分页日志、健康摘要和结构化状态，供自动化系统决定是否继续等待、重试或报警。

<h2 id="observe-log-health-recovery">如何根据结果恢复</h2>

常见判断：

- 日志显示端口冲突：修 network profile 或启动命令。
- 日志显示缺少变量：修 environment variables 并重新部署。
- 健康检查超时：调整 health path、timeout、retries 或 start period。
- 应用健康但默认访问失败：看 proxy readiness 和 access route。

相关页面：[Health and network profiles](/docs/resources/profiles/health-network/) 和 [Generated access routes](/docs/access/generated-routes/)。

CLI 示例：

```bash title="读取运行时日志"
appaloft resource logs res_web --tail 100
```

```bash title="读取健康摘要"
appaloft resource health res_web --checks --public-access-probe
```

HTTP API 示例：

```http title="Runtime logs"
GET /api/resources/res_web/runtime-logs?tailLines=100
```
