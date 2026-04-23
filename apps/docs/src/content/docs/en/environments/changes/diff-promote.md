---
title: "Diff and promote environments"
description: "Compare environment configuration and promote settings into a target environment."
docType: task
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "diff"
  - "promote"
  - "compare env"
relatedOperations:
  - environments.diff
  - environments.promote
sidebar:
  label: "Diff and promote"
  order: 5
---

<h2 id="environment-diff">Compare environments</h2>

Diff shows missing variables, changed values, and secret state differences between environments.

<h2 id="environment-promote">Promote environment settings</h2>

Promote creates new configuration state for the target environment instead of changing historical deployments.

<h2 id="environment-promote-safety">Safety checks</h2>

Confirm the target environment, secret handling, and whether a new deployment should be triggered.
