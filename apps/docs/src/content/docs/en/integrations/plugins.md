---
title: "Plugins"
description: "Understand plugin discovery, compatibility, permissions, and sandbox assumptions."
docType: reference
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "plugin"
  - "extension"
  - "compatibility"
relatedOperations:
  - system.plugins.list
sidebar:
  label: "Plugins"
  order: 3
---

<h2 id="advanced-plugin-boundary">Plugin boundary</h2>

Plugins extend Appaloft through explicit capabilities. User docs should explain compatibility, permissions, and sandbox assumptions.

<h2 id="plugin-safety">Safety assumptions</h2>

Plugin docs should explain what the plugin can read, what it can change, how to disable it, and what users see when it is incompatible.

`appaloft plugins list` and `GET /api/plugins` expose safe plugin diagnostics. Each plugin can report manifest capability flags, human-readable capability details, enabled state, compatibility state, and configuration diagnostics.

Incompatible plugins remain visible but inactive so operators can tell the difference between an unavailable extension and an unknown plugin. Plugin diagnostics should not expose plugin implementation internals, provider SDK objects, access tokens, private keys, secret references, or raw runtime output.
