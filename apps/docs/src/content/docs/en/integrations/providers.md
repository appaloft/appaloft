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

`appaloft providers list` and `GET /api/providers` expose safe provider diagnostics. Each provider can report stable capability flags, human-readable capability details, whether each capability is enabled, and a configuration status such as configured, not configured, partial, or unknown.

Provider diagnostics are for operator visibility. They should never include cloud SDK object names, raw provider responses, access tokens, private keys, certificate material, secret references, or unredacted command output. Planned providers can appear with disabled capabilities and not-configured diagnostics so operators can see that the provider is known but unavailable.
