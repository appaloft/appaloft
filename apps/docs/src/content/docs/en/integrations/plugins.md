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
