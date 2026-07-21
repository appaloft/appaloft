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

## Provider 边界 [#advanced-provider-boundary]

Provider 负责外部系统或基础设施能力。Public docs 应解释用户能配置和观察什么，不暴露 provider SDK 类型。

## 能力 [#provider-capabilities]

能力应以用户可理解的方式展示，例如运行目标、代理能力、证书能力或诊断能力。

`appaloft providers list` 和 `GET /api/providers` 会暴露安全的 provider 诊断信息。每个 provider 可以返回稳定的能力标记、面向用户的能力详情、能力是否启用，以及 configured、not configured、partial 或 unknown 等配置状态。

Provider 诊断只用于 operator 可见性，不应包含云 SDK 对象名称、原始 provider 响应、access token、private key、证书材料、secret reference 或未脱敏的命令输出。计划中的 provider 可以显示为 disabled capabilities 和 not-configured diagnostics，方便 operator 区分“已知但不可用”和“未知 provider”。
