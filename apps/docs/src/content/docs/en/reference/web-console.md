---
title: "Web console guide"
description: "Web console pages, form inputs, question-mark help, and status observation."
docType: reference
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "web"
  - "console"
  - "question mark"
  - "ui"
relatedOperations:
  - resources.create
  - deployments.create
sidebar:
  label: "Web console guide"
  order: 11
---

<h2 id="web-help-question-mark">Question-mark help</h2>

Fields that are easy to misunderstand should have `?` links to stable public docs anchors.

<h2 id="web-owner-scoped-actions">Owner-scoped actions</h2>

Resource operations should appear on the resource detail surface where possible.

<h2 id="web-no-business-logic">No hidden business logic</h2>

The Web console collects input, displays state, and calls HTTP/oRPC contracts. Business meaning remains shared.

<h2 id="web-local-docs-links">Local docs links</h2>

Self-hosted Web `?` links should prefer local `/docs/*` targets.

When running the Web Vite dev server by itself, `/docs/*` redirects to the local Docs dev server. The root `bun dev` command starts docs as well; set `APPALOFT_DEV_DOCS_HOST` / `APPALOFT_DEV_DOCS_PORT` to move local docs, or set `APPALOFT_WEB_DEV_DOCS_TARGET` to override the full target.
