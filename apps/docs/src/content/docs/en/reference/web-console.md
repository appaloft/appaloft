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

## Question-mark help [#web-help-question-mark]

Fields that are easy to misunderstand should have `?` links to stable public docs anchors.

## Owner-scoped actions [#web-owner-scoped-actions]

Resource operations should appear on the resource detail surface where possible.

## No hidden business logic [#web-no-business-logic]

The Web console collects input, displays state, and calls HTTP/oRPC contracts. Business meaning remains shared.

## Local docs links [#web-local-docs-links]

Self-hosted Web `?` links should prefer local `/docs/*` targets.

When running the Web Vite dev server by itself, `/docs/*` redirects to the local Docs dev server. The root `bun dev` command starts docs as well; set `APPALOFT_DEV_DOCS_HOST` / `APPALOFT_DEV_DOCS_PORT` to move local docs, or set `APPALOFT_WEB_DEV_DOCS_TARGET` to override the full target.

## Product version [#web-product-version]

The Web console displays the Appaloft product version returned by backend `/api/version`. Release and binary packaging inject it through `APPALOFT_APP_VERSION`, while development falls back to the repository root `package.json` version.
