---
title: "Variable precedence and snapshots"
description: "理解变量优先级、构建时变量、运行时变量和部署快照。"
docType: concept
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "env"
  - "variables"
  - "snapshot"
  - "precedence"
  - "环境变量"
relatedOperations:
  - environments.set-variable
  - environments.unset-variable
  - resources.set-variable
  - resources.unset-variable
  - resources.effective-config
sidebar:
  label: "Precedence and snapshots"
  order: 3
---

<h2 id="environment-variable-precedence">变量优先级</h2>

Appaloft 的配置优先级是 defaults、system、organization、project、environment、resource、deployment snapshot。用户不需要记住内部层级，但需要知道最终部署使用的是快照值。

用户可见规则：

- 越靠近具体部署的配置优先级越高。
- 环境变量覆盖项目或系统默认值。
- 同一个资源上的资源级变量会覆盖同 `key + exposure` 的环境级变量。
- 部署创建时会保存不可变快照。
- 部署完成后再修改变量，不会改变那次部署。

这让用户可以安全地修改 staging 或 production 配置，而不用担心历史部署被悄悄改写。

<h2 id="environment-variable-build-vs-runtime">构建时和运行时变量</h2>

构建时变量会进入构建产物，不能标记为 secret。运行时变量用于应用启动和运行环境。

区别：

| 类型 | 何时使用 | 是否可以是 secret |
| --- | --- | --- |
| 构建时变量 | build 阶段，例如前端构建、静态产物生成。 | 不可以。可能进入产物。 |
| 运行时变量 | 应用启动和运行时读取。 | 可以。读模型和日志必须屏蔽值。 |

如果一个变量会被浏览器看到，例如 `PUBLIC_` 或 `VITE_` 前缀变量，不要把它标记或当作 secret 使用。

<h2 id="environment-snapshot">部署快照</h2>

每次部署都保存不可变环境快照。这个快照可能同时包含环境级变量和资源级覆盖值。后续修改变量不会改变已经完成或正在运行的部署。

用户应该在部署详情中看到“这次部署使用的配置摘要”，而不是只能看到当前环境变量表。

<h2 id="environment-variable-surfaces">入口说明</h2>

Web console 应显示环境变量和资源级变量列表、secret 屏蔽状态、最近修改时间、作用域和部署快照提示。

CLI 适合 `set`、`unset`、`effective-config`、`diff` 和自动化脚本。CLI 输出 secret 时只应显示 masked 状态，不显示值。

HTTP API 应返回变量 key、作用域、是否 secret、来源层级和 masked value。API 不应返回明文 secret。

<h2 id="environment-variable-recovery">常见问题</h2>

如果部署没有读到新变量：

1. 确认变量设置在正确环境。
2. 确认变量是构建时还是运行时需要。
3. 如果是运行中实例，需要重新部署才能读取新的部署快照。
4. 如果是构建时变量，需要重新构建并部署。

相关页面：[Secrets](/docs/environments/variables/secrets/) 和 [Diff and promote environments](/docs/environments/changes/diff-promote/)。
