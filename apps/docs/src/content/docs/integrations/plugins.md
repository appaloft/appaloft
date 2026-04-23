---
title: "Plugins"
description: "理解 plugin 发现、兼容性、权限和沙箱假设。"
docType: reference
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "plugin"
  - "extension"
  - "compatibility"
  - "插件"
relatedOperations:
  - system.plugins.list
sidebar:
  label: "Plugins"
  order: 3
---

<h2 id="advanced-plugin-boundary">Plugin 边界</h2>

Plugin 扩展能力必须显式声明。用户文档应说明兼容性、权限和沙箱假设。

<h2 id="plugin-safety">安全假设</h2>

插件文档应说明它能读取什么、修改什么、如何禁用，以及不兼容时用户会看到什么状态。
