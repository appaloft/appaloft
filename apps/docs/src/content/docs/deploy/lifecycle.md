---
title: "Deployment lifecycle"
description: "从 detect、plan、execute、verify 到 rollback 理解一次部署。"
docType: concept
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "lifecycle"
  - "detect"
  - "plan"
  - "verify"
  - "rollback"
  - "部署生命周期"
relatedOperations:
  - deployments.create
  - deployments.plan
  - deployments.show
sidebar:
  label: "Lifecycle"
  order: 3
---

<h2 id="deployment-lifecycle">部署生命周期</h2>

Appaloft 把部署建模为 `detect -> plan -> execute -> verify -> rollback`。

这个生命周期用于解释用户看到的部署状态。它不是内部实现细节：用户需要知道当前卡在哪一步、这一步读取什么输入、失败后该怎么恢复。

![Deployment lifecycle](/docs/diagrams/deployment-lifecycle.svg)

<h3 id="deployment-detect">Detect</h3>

Detect 读取 source 和配置线索，判断应用类型、构建方式、运行入口和网络暴露需求。

常见失败：

- source 不可读取。
- 仓库 ref 或 base directory 不存在。
- 应用类型无法判断，且用户没有提供 runtime profile。

<h3 id="deployment-plan">Plan</h3>

Plan 把 source、runtime、health、network 配置转成可执行计划。计划需要解释 Appaloft 准备运行什么，而不是只显示一段 shell 命令。

计划中用户应该能看到构建、启动、健康检查和访问路由的摘要。

<h3 id="deployment-plan-preview">部署前计划预览</h3>

计划预览只运行 `detect -> plan`，不会创建 deployment attempt，不会写入部署事件，也不会执行 build、run、verify 或 proxy 修改。

预览会显示检测到的 framework/runtime 证据、选中的 planner、artifact 类型、install/build/start/package 命令、内部端口、健康检查、访问路由摘要、warning 和 unsupported reasons。用户可以据此先修 resource source/runtime/network/health/access profile，再运行真正的部署。

<h3 id="deployment-execute">Execute</h3>

在目标服务器或执行环境中构建、上传、启动和路由应用。

执行阶段失败通常和网络、凭据、镜像拉取、构建命令、服务器资源或 runtime 后端有关。用户应先查看运行时日志和诊断摘要，而不是立即修改域名。

<h3 id="deployment-verify">Verify</h3>

检查进程、健康策略、代理路由和访问地址。

Verify 失败不一定表示应用没有启动。它可能是健康检查路径、监听端口、代理路由或访问 URL 观测失败。

<h3 id="deployment-rollback">Rollback</h3>

失败后的恢复路径。Rollback 不能把失败隐藏成成功，用户需要知道当前状态能否重试。

<h2 id="deployment-status-reading">如何读状态</h2>

用户应优先看最近失败阶段：

- detect 失败：修 source 或配置。
- plan 失败：修资源 profile。
- execute 失败：看服务器、凭据、构建和运行时日志。
- verify 失败：看 health、network、proxy 和 access route。
- rollback 失败：需要人工介入，先保存诊断摘要。

相关页面：[Deployment sources](/docs/deploy/sources/)、[Logs and health](/docs/observe/logs-health/)、[Safe recovery](/docs/observe/recovery/)。

部署状态响应示例：

```json title="GET /api/deployments/dep_123"
{
  "id": "dep_123",
  "resourceId": "res_web",
  "status": "verifying",
  "currentPhase": "verify",
  "sourceSummary": {
    "kind": "git-repository",
    "gitRef": "main",
    "baseDirectory": "."
  },
  "recoveryHint": "Inspect health summary before retrying."
}
```
