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
  - deployments.timeline.stream
sidebar:
  label: "Lifecycle"
  order: 3
---

## 部署生命周期 [#deployment-lifecycle]

Appaloft 把部署建模为 `detect -> plan -> execute -> verify -> rollback`。

这个生命周期用于解释用户看到的部署状态。它不是内部实现细节：用户需要知道当前卡在哪一步、这一步读取什么输入、失败后该怎么恢复。

当 Project、Environment、Resource profile 和 Server 已经存在时，登录后的远程 CLI 可以直接提交第一次部署，而不运行本地 Quick Deploy：

```bash
appaloft deployments create \
  --project <projectId> \
  --environment <environmentId> \
  --resource <resourceId> \
  --server <serverId>
```

这个命令只通过共享的 `deployments.create` 合约发送既有上下文 ID，不上传本地源码包，也不使用仓库部署配置字段；常规 CLI 目标选择仍可能读取仓库的 `controlPlane` 配置。返回 deployment id 只表示 attempt 已接受；仍需通过 timeline 和 proof 命令验证执行结果。

![Deployment lifecycle](/docs/diagrams/deployment-lifecycle.svg)

### Detect [#deployment-detect]

Detect 读取 source 和配置线索，判断应用类型、构建方式、运行入口和网络暴露需求。

常见失败：

- source 不可读取。
- 仓库 ref 或 base directory 不存在。
- 应用类型无法判断，且用户没有提供 runtime profile。

### Plan [#deployment-plan]

Plan 把 source、runtime、health、network 配置转成可执行计划。计划需要解释 Appaloft 准备运行什么，而不是只显示一段 shell 命令。

计划中用户应该能看到构建、启动、健康检查和访问路由的摘要。

### 部署前计划预览 [#deployment-plan-preview]

计划预览只运行 `detect -> plan`，不会创建 deployment attempt，不会写入部署事件，也不会执行 build、run、verify 或 proxy 修改。

预览会显示检测到的 framework/runtime 证据、选中的 planner、support tier、artifact 类型、install/build/start/package 命令、内部端口、健康检查、访问路由摘要、warning 和 unsupported reasons。被阻止的预览会包含 phase、reason code、安全证据、fix path、override path，以及能定位时的 affected resource profile field。用户可以据此先修 resource source/runtime/network/health/access profile，再运行真正的部署。

显式 planner/profile 选择优先于推断。自定义 install/build/start 命令、Dockerfile、Compose、prebuilt image、source base directory、internal port 和显式 health policy 都可以在运行 `deployments.create` 前修复 unsupported、ambiguous 或 missing evidence。静态部署使用 Appaloft static server 的 internal port `80`；SSR 或 HTTP 服务需要在 resource network profile 中配置 internal port。

如果应用还没有一等 framework planner，但 adapter 能识别 buildpack-style 证据，预览会把它标成 buildpack accelerator，而不是把它当成新的部署命令。用户会看到 platform files、language/framework hints、detected buildpacks、builder policy、限制和修复路径。显式 planner、Dockerfile/Compose/prebuilt image、static 策略和自定义 runtime commands 仍然优先；buildpack 不会把 source/runtime/network 字段塞进 `deployments.create`。

### Execute [#deployment-execute]

在目标服务器或执行环境中构建、上传、启动和路由应用。

执行阶段失败通常和网络、凭据、镜像拉取、构建命令、服务器资源或 runtime 后端有关。用户应先查看运行时日志和诊断摘要，而不是立即修改域名。

Compose 更新会先执行 image preflight：拉取所有 image-backed services，再构建 buildable services，最后才启动候选 project。预检失败不会启动候选容器。Compose 公网路由还必须配置明确的 `targetServiceName`，以便 Appaloft 只把代理 labels 和 edge network 注入目标 service。

### Verify [#deployment-verify]

检查进程、健康策略、代理路由和访问地址。

Verify 失败不一定表示应用没有启动。它可能是健康检查路径、监听端口、代理路由或访问 URL 观测失败。

`docker compose up` 返回成功不等于部署成功。Appaloft 还会确认候选容器存在且正在运行、Docker/Compose 原生 health 没有失败，并在配置了目标 service、HTTP health 或公网路由时完成对应验证。失败候选按 deployment identity 清理；旧的成功 runtime 和 route 不会因为新候选验证失败而被当作成功替换。

如果原始 deploy 命令已经断开，但仍需要结构化 replay 或 live timeline stream，可以使用 `appaloft deployments timeline <deploymentId> --follow --json`。这个 stream 可能返回 entry、heartbeat、gap、closed 或 error envelope；gap 表示观测连续性不完整，应重新打开观测或查看 deployment detail 后再决定恢复动作。

### 部署证明 [#deployment-proof]

自动化需要判断已接受的源码、产物和配置是否真的成为当前工作负载时，运行 `appaloft deployments proof <deploymentId> --json`，或读取 `GET /api/deployments/{deploymentId}/proof`。

结果区分 `verified`、`partially-verified`、`unverified`、`stale` 和 `failed`。它会比较安全的源码、产物、配置指纹，以及实际 runtime identity、workload generation、health、access route ownership 和 recovery evidence。Adapter 暂时拿不到的证据会明确标为 unavailable，绝不会算成 verified。因此旧工作负载即使仍然健康，这次部署仍可能验证失败或已经过时。

### Rollback [#deployment-rollback]

失败后的恢复路径。Rollback 不能把失败隐藏成成功，用户需要知道当前状态能否重试。

## 如何读状态 [#deployment-status-reading]

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
