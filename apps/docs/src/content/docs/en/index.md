---
title: "Appaloft Docs"
description: "Task-oriented Appaloft documentation for deploying apps, configuring resources, connecting servers, observing status, and recovering from failures."
template: splash
docType: index
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "docs"
  - "documentation"
  - "help"
relatedOperations: []
hero:
  title: "Make deployments explainable"
  tagline: "Appaloft docs are organized by user tasks: detect -> plan -> execute -> verify -> rollback. CLI, HTTP API, and Web console share the same concepts."
  actions:
    - text: "Start deploying"
      link: /docs/en/start/first-deployment/
      icon: right-arrow
    - text: "Troubleshoot"
      link: /docs/en/observe/logs-health/
      variant: minimal
      icon: external
---

<h2 id="docs-entry-map">Entry map</h2>

Appaloft is not a Web-first CRUD app. You can operate the same deployment product from the CLI, HTTP API, Web console, and future MCP/tool surfaces.

<h2 id="docs-reader-path">Recommended path</h2>

1. Read [Start here](/docs/en/start/first-deployment/) for the smallest successful deployment path.
2. Read [Projects and resources](/docs/en/resources/projects/) or [Environment variables](/docs/en/environments/variables/precedence/) when an input term is unclear.
3. Read [Logs and health](/docs/en/observe/logs-health/) and [Diagnostics](/docs/en/observe/diagnostics/) when an operation fails.
4. Read [CLI reference](/docs/en/reference/cli/) and [HTTP API reference](/docs/en/reference/http-api/) for automation.

<h2 id="docs-local-help">Local help</h2>

Self-hosted and binary installs embed public docs static assets as a separate asset surface and serve them from local `/docs/*` paths. To replace the bundled docs, point `APPALOFT_DOCS_STATIC_DIR` at another static docs build without overriding Web console assets.
