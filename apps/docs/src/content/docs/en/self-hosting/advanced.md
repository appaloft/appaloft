---
title: "Advanced reference"
description: "Control-plane modes, packaging, self-hosting, providers, plugins, and advanced runtime notes."
docType: reference
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "advanced"
  - "control plane"
  - "provider"
  - "plugin"
  - "binary"
relatedOperations: []
sidebar:
  label: "Advanced reference"
  order: 12
---

<h2 id="advanced-control-plane-modes">Control-plane modes</h2>

Appaloft supports local-first, self-hosted, and future cloud-assisted control-plane paths.

<h2 id="advanced-binary-packaging">Binary packaging</h2>

The binary embeds Web console assets and public docs assets separately. Docs are served under `/docs/*`. When `APPALOFT_DOCS_STATIC_DIR` is set, Appaloft serves docs from that directory while Web console assets keep their own source.

<h2 id="advanced-provider-boundary">Provider boundary</h2>

Provider docs explain what users can configure and observe without leaking provider SDK types.

<h2 id="advanced-plugin-boundary">Plugin boundary</h2>

Plugin docs explain compatibility, permissions, and sandbox assumptions.
