---
title: "Providers"
description: "Understand provider capabilities, boundaries, and user-visible configuration."
docType: reference
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "provider"
  - "capability"
  - "cloud provider"
relatedOperations:
  - system.providers.list
sidebar:
  label: "Providers"
  order: 2
---

<h2 id="advanced-provider-boundary">Provider boundary</h2>

Providers own external-system or infrastructure capabilities. Public docs should explain what users can configure and observe, not provider SDK types.

<h2 id="provider-capabilities">Capabilities</h2>

Capabilities should be shown in user-facing terms such as runtime target, proxy capability, certificate capability, or diagnostics capability.
