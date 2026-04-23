---
title: "Diff and promote environments"
description: "比较环境配置并把配置提升到目标环境。"
docType: task
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "diff"
  - "promote"
  - "compare env"
  - "环境对比"
relatedOperations:
  - environments.diff
  - environments.promote
sidebar:
  label: "Diff and promote"
  order: 5
---

<h2 id="environment-diff">比较环境</h2>

Diff 帮助用户理解两个环境的差异，包括缺失变量、不同值和 secret 状态差异。

<h2 id="environment-promote">提升环境</h2>

Promote 会创建面向目标环境的新配置状态，而不是直接覆盖历史部署。

<h2 id="environment-promote-safety">安全检查</h2>

Promote 前应确认目标环境、secret 处理方式和是否需要触发新的部署。
