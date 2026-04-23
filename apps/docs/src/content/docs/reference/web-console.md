---
title: "Web console guide"
description: "Web console 页面、表单输入、问号帮助和状态观察说明。"
docType: reference
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "web"
  - "console"
  - "question mark"
  - "ui"
  - "控制台"
  - "问号"
relatedOperations:
  - resources.create
  - deployments.create
sidebar:
  label: "Web console guide"
  order: 11
---

<h2 id="web-help-question-mark">问号帮助</h2>

Web 表单里容易误解的字段应该有 `?` 帮助链接。链接目标必须是稳定 public docs anchor，而不是翻译标题生成的临时 id。

<h2 id="web-owner-scoped-actions">资源视角操作</h2>

资源相关操作应优先出现在资源详情页，例如新部署、运行时日志、健康状态、代理配置和域名动作。

<h2 id="web-no-business-logic">不隐藏业务逻辑</h2>

Web console 只收集输入、显示状态并调用 HTTP/oRPC 合同。部署规则和生命周期解释必须来自共享业务语义和 public docs。

<h2 id="web-local-docs-links">本地文档链接</h2>

自托管时，Web `?` 链接应优先打开本地 `/docs/*`，保持离线可用。

单独运行 Web Vite dev server 时，`/docs/*` 会重定向到本地 Docs dev server。根 `bun dev` 会同时启动 docs；如需调整本地 docs 地址，可设置 `APPALOFT_DEV_DOCS_HOST` / `APPALOFT_DEV_DOCS_PORT`，或用 `APPALOFT_WEB_DEV_DOCS_TARGET` 覆盖完整目标。
