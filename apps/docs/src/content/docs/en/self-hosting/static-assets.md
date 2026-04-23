---
title: "Static assets"
description: "Understand how Web console and docs static assets are bundled and overridden."
docType: reference
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "static assets"
  - "docs static"
  - "web console"
relatedOperations: []
sidebar:
  label: "Static assets"
  order: 2
---

<h2 id="advanced-binary-packaging">Binary packaging</h2>

The binary embeds Web console assets and public docs assets separately. Docs are served under `/docs/*` by default.

<h2 id="self-hosting-docs-override">Docs override</h2>

Set `APPALOFT_DOCS_STATIC_DIR` to serve docs from a directory while the Web console keeps its own asset source.
