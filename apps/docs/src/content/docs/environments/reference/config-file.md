---
title: "Configuration file"
description: "面向用户的 Appaloft 配置文件字段说明。"
docType: reference
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "config file"
  - "appaloft config"
  - "repository config"
  - "配置文件"
relatedOperations: []
sidebar:
  label: "Config file"
  order: 6
---

<h2 id="environment-config-file-purpose">配置文件用途</h2>

配置文件适合保存可审查的项目、资源、环境和部署默认值。Secret 值不应该直接写入仓库。

<h2 id="environment-config-file-fields">字段分类</h2>

字段应按 project、resource、environment、deployment 和 access 分类解释，避免暴露内部实现术语。
