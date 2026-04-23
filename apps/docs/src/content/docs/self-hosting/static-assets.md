---
title: "Static assets"
description: "理解 Web console 和 docs 静态资源如何打包和覆盖。"
docType: reference
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "static assets"
  - "docs static"
  - "web console"
  - "静态资源"
relatedOperations: []
sidebar:
  label: "Static assets"
  order: 2
---

<h2 id="advanced-binary-packaging">Binary 打包</h2>

Binary 会嵌入 Web console 静态资源和 public docs 静态资源。两者分开嵌入、分开覆盖，docs 默认服务在 `/docs/*`。

<h2 id="self-hosting-docs-override">Docs 覆盖</h2>

如果设置 `APPALOFT_DOCS_STATIC_DIR`，Appaloft 会从该目录提供 docs，而 Web console 继续使用自己的静态资源来源。
