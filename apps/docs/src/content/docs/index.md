---
title: "Appaloft 文档"
description: "从用户任务出发理解 Appaloft：部署应用、配置资源、接入服务器、观察状态并处理故障。"
template: splash
docType: index
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "docs"
  - "documentation"
  - "帮助"
  - "文档"
relatedOperations: []
hero:
  title: "把部署变成可解释的操作链"
  tagline: "Appaloft 文档按用户任务组织：detect -> plan -> execute -> verify -> rollback。CLI、HTTP API 和 Web console 共用同一套概念。"
  actions:
    - text: "开始部署"
      link: /docs/start/first-deployment/
      icon: right-arrow
    - text: "排查问题"
      link: /docs/observe/logs-health/
      variant: minimal
      icon: external
---

<h2 id="docs-entry-map">入口地图</h2>

Appaloft 不是 Web-first CRUD 应用。你可以从 CLI、HTTP API、Web console，未来也可以从 MCP/tool 入口完成同一组部署操作。

<h2 id="docs-reader-path">建议阅读路径</h2>

1. 先读 [Start here](/docs/start/first-deployment/) 建立最小部署路径。
2. 遇到输入概念不清楚时读 [Projects and resources](/docs/resources/projects/) 或 [Environment variables](/docs/environments/variables/precedence/)。
3. 操作失败时读 [Logs and health](/docs/observe/logs-health/) 与 [Diagnostics](/docs/observe/diagnostics/)。
4. 自动化接入时读 [CLI reference](/docs/reference/cli/) 和 [HTTP API reference](/docs/reference/http-api/)。

<h2 id="docs-local-help">本地帮助</h2>

自托管和 binary 版本会把文档静态资源作为独立资产嵌入到 Appaloft，并在本地 `/docs/*` 路径提供帮助。需要替换文档站时，可以通过 `APPALOFT_DOCS_STATIC_DIR` 指向新的静态构建产物，而不会覆盖 Web console 静态资源。
