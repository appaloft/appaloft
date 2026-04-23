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

<h2 id="advanced-binary-packaging">Binary 打包</h2>

binary 会嵌入 Web console 静态资源和 public docs 静态资源。两者分开嵌入、分开覆盖，docs 默认服务在 `/docs/*`。如果设置 `APPALOFT_DOCS_STATIC_DIR`，Appaloft 会从该目录提供 docs，而 Web console 继续使用自己的静态资源来源。

<h2 id="advanced-provider-boundary">Provider 边界</h2>

Provider 负责外部系统或基础设施能力。public docs 应解释用户能配置和观察什么，不暴露 provider SDK 类型。

<h2 id="advanced-plugin-boundary">Plugin 边界</h2>

Plugin 扩展能力必须显式声明。用户文档应说明兼容性、权限和沙箱假设。
