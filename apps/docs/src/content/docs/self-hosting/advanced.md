---
title: "Advanced reference"
description: "控制面模式、打包、自托管、provider、plugin 和高级运行时说明。"
docType: reference
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "advanced"
  - "control plane"
  - "provider"
  - "plugin"
  - "binary"
  - "高级"
  - "打包"
relatedOperations: []
sidebar:
  label: "Advanced reference"
  order: 12
---

<h2 id="advanced-control-plane-modes">控制面模式</h2>

Appaloft 支持本地优先、自托管和未来云辅助的控制面路径。用户需要理解状态归属和执行归属，而不是内部协调实现。
`appaloft doctor`、`GET /api/system/doctor` 和 Web Instance 页面会暴露本地 readiness、
provider/plugin 诊断和 scheduled worker 配置激活状态，但不会启动 worker 或派发维护工作。

<h2 id="maintenance-worker-activation">维护 worker 激活</h2>

维护 worker 是后台轮询器。`appaloft doctor`、`GET /api/system/doctor` 和 Web Instance 页面只展示
worker 的配置状态，不会启动 worker、tick scheduler 或执行维护任务。

默认情况下，certificate retry scheduler 会随后端服务启动，用来重试已接受的证书工作。preview cleanup
retry、preview expiry cleanup、scheduled task runner、scheduled runtime prune、scheduled history
retention 和 runtime monitoring collector 默认禁用；只有配置显式启用后才会随后端服务启动。

即使 worker 已启用，它也仍然受自己的安全模式约束：scheduled runtime prune 需要已配置的 prune
policy，history retention 受 retention policy 约束，runtime monitoring collector 只采集有界样本，
scheduled task runner 只执行到期的 scheduled task run。
doctor 输出和 Web Instance 面板也会展示每个 worker 对应的安全 `APPALOFT_*` 配置键；disabled
worker 只有在 operator 修改对应配置后才会变成 active。

<h2 id="advanced-binary-packaging">Binary 打包</h2>

binary 会嵌入 Web console 静态资源和 public docs 静态资源。两者分开嵌入、分开覆盖，docs 默认服务在 `/docs/*`。如果设置 `APPALOFT_DOCS_STATIC_DIR`，Appaloft 会从该目录提供 docs，而 Web console 继续使用自己的静态资源来源。

<h2 id="advanced-provider-boundary">Provider 边界</h2>

Provider 负责外部系统或基础设施能力。public docs 应解释用户能配置和观察什么，不暴露 provider SDK 类型。

<h2 id="advanced-plugin-boundary">Plugin 边界</h2>

Plugin 扩展能力必须显式声明。用户文档应说明兼容性、权限和沙箱假设。
