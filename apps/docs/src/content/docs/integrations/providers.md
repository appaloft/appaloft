---
title: "Providers"
description: "理解 provider 能力、边界和用户可见配置。"
docType: reference
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "provider"
  - "capability"
  - "cloud provider"
  - "provider 边界"
relatedOperations:
  - system.providers.list
sidebar:
  label: "Providers"
  order: 2
---

<h2 id="advanced-provider-boundary">Provider 边界</h2>

Provider 负责外部系统或基础设施能力。Public docs 应解释用户能配置和观察什么，不暴露 provider SDK 类型。

<h2 id="provider-capabilities">能力</h2>

能力应以用户可理解的方式展示，例如运行目标、代理能力、证书能力或诊断能力。
