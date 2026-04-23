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

<h2 id="api-lifecycle-status">生命周期状态</h2>

API 调用方需要通过公开 query 或 read model 观察异步状态，而不是检查数据库或内部运行时对象。

<h2 id="api-error-recovery">错误和恢复</h2>

错误文档应包含稳定 code、category、是否可重试、用户下一步操作，以及相关 troubleshooting 页面。

<h2 id="api-doc-links">API 描述中的文档链接</h2>

OpenAPI、oRPC 和未来工具描述应该指向 public docs anchor，而不是内部 spec 文件。
