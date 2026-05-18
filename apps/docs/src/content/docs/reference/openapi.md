---
title: "OpenAPI reference"
description: "按业务操作生成的 OpenAPI reference 入口。"
docType: reference
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "openapi"
  - "api reference"
  - "http api"
relatedOperations:
  - projects.create
  - resources.create
  - deployments.create
sidebar:
  label: "OpenAPI"
  order: 11
---

<h2 id="openapi-generated-reference">生成的 operation 页面</h2>

公共文档站点会从 Appaloft 的 OpenAPI 3.1 schema 生成每个 HTTP operation 的独立 reference 页面。

这些页面位于 `/docs/reference/openapi/*`，并保留稳定的 `/docs/reference/openapi/` 入口，方便 Web help、CLI help 和外部书签指向同一个位置。

<h2 id="openapi-source-of-truth">契约来源</h2>

OpenAPI schema 由 `@appaloft/openapi` 生成，operation 名称、输入 schema、输出形状和错误描述必须继续来自共享业务操作契约。

如果 API 行为发生变化，请同时更新业务操作目录、公开文档覆盖记录，以及对应的 API/CLI 帮助链接。
