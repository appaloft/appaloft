---
title: "HTTP API reference"
description: "HTTP/oRPC 操作、输入 schema、输出状态和错误恢复说明的公开入口。"
docType: reference
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "api"
  - "http"
  - "orpc"
  - "openapi"
relatedOperations:
  - projects.create
  - resources.create
  - deployments.create
sidebar:
  label: "HTTP API reference"
  order: 10
---

<h2 id="api-shared-operation-schema">共享操作 schema</h2>

HTTP/oRPC 输入必须复用业务操作 schema。文档应解释字段含义，而不是为 HTTP 单独发明另一套业务语义。

<h2 id="api-openapi-reference">OpenAPI 和 Scalar reference</h2>

后端默认在 `/api/openapi.json` 提供 OpenAPI 3.1 文档，在 `/api/reference` 提供 Scalar 交互式 API reference。

公共文档站点也会在 `/docs/reference/openapi/` 生成 OpenAPI reference 页面，并把每个 operation 展开到独立页面。

这些入口由内置 OpenAPI Reference 系统插件注册。需要嵌入到其他 Bun/Elysia 服务时，可以 import `@appaloft/openapi` 并把它导出的 `Response` handler 挂到自己的路由上。

<h2 id="api-lifecycle-status">生命周期状态</h2>

API 调用方需要通过公开 query 或 read model 观察异步状态，而不是检查数据库或内部运行时对象。

<h2 id="api-error-recovery">错误和恢复</h2>

错误文档应包含稳定 code、category、是否可重试、用户下一步操作，以及相关 troubleshooting 页面。

<h2 id="api-doc-links">API 描述中的文档链接</h2>

OpenAPI、oRPC 和未来工具描述应该指向 public docs anchor，而不是内部 spec 文件。
