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
`appaloft doctor`, `GET /api/system/doctor`, and the Web Instance page expose local readiness,
provider/plugin diagnostics, and configured scheduled worker activation without starting workers or
dispatching maintenance work.

<h2 id="maintenance-worker-activation">Maintenance worker activation</h2>

Maintenance workers are background pollers. `appaloft doctor`, `GET /api/system/doctor`, and the
Web Instance page show configured worker status only; they do not start workers, tick schedulers, or
run maintenance work.

By default, the certificate retry scheduler starts with the backend service so accepted certificate
work can retry. Preview cleanup retry, preview expiry cleanup, the scheduled task runner, scheduled
runtime prune, scheduled history retention, and the runtime monitoring collector are disabled by
default; they start with the backend service only after configuration explicitly enables them.

Even when a worker is enabled, it still follows its safety mode: scheduled runtime prune requires a
configured prune policy, history retention follows retention policy, the runtime monitoring
collector records bounded samples, and the scheduled task runner only runs due scheduled task runs.
The doctor output and Web Instance panel also show the safe `APPALOFT_*` configuration keys for each
worker, so a disabled worker remains explicit until an operator changes the matching setting.

<h2 id="advanced-binary-packaging">Binary packaging</h2>

The binary embeds Web console assets and public docs assets separately. Docs are served under `/docs/*`. When `APPALOFT_DOCS_STATIC_DIR` is set, Appaloft serves docs from that directory while Web console assets keep their own source.

<h2 id="advanced-provider-boundary">Provider boundary</h2>

Provider docs explain what users can configure and observe without leaking provider SDK types.

<h2 id="advanced-plugin-boundary">Plugin boundary</h2>

Plugin docs explain compatibility, permissions, and sandbox assumptions.
