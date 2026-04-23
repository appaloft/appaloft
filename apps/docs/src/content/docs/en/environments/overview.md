---
title: "Environments and variables"
description: "Understand variable precedence, secrets, snapshots, and environment diffs."
docType: concept
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "environment"
  - "env vars"
  - "secret"
  - "snapshot"
relatedOperations:
  - environments.create
  - environments.set-variable
  - environments.unset-variable
  - environments.diff
  - environments.promote
sidebar:
  label: "Environments and variables"
  order: 6
---

<h2 id="environment-variable-precedence">Variable precedence</h2>

Appaloft resolves configuration in this order: defaults, system, organization, project, environment, deployment snapshot.

<h2 id="environment-variable-build-vs-runtime">Build-time and runtime variables</h2>

Build-time variables can be included in build output and cannot be marked secret. Runtime variables are supplied to the running app, and secret values must be masked.

<h2 id="environment-snapshot">Deployment snapshot</h2>

Each deployment persists an immutable environment snapshot.

<h2 id="environment-diff">Diff and promote</h2>

Diff explains configuration differences. Promote creates a new target environment state instead of rewriting historical deployments.
