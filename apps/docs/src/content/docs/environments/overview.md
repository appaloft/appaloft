---
title: "Environments and variables"
description: "理解环境变量优先级、secret 处理、快照和环境差异。"
docType: concept
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "environment"
  - "env vars"
  - "secret"
  - "snapshot"
  - "环境变量"
  - "密钥"
relatedOperations:
  - environments.create
  - environments.set-variable
  - environments.unset-variable
  - environments.diff
  - environments.promote
sidebar:
  label: "Environments and variables"
  order: 6
---

<h2 id="environment-variable-precedence">变量优先级</h2>

Appaloft 的配置优先级是 defaults、system、organization、project、environment、deployment snapshot。用户不需要记住内部层级，但需要知道最终部署使用的是快照值。

<h2 id="environment-variable-build-vs-runtime">构建时和运行时变量</h2>

构建时变量会进入构建产物，不能标记为 secret。运行时变量用于应用启动和运行环境，secret 值在读模型、日志和诊断信息中必须屏蔽。

<h2 id="environment-snapshot">部署快照</h2>

每次部署都保存不可变环境快照。后续修改环境变量不会改变已经完成或正在运行的部署。

<h2 id="environment-diff">比较和提升</h2>

Diff 帮助用户理解两个环境的差异。Promote 会创建面向目标环境的新配置状态，而不是直接覆盖历史部署。
