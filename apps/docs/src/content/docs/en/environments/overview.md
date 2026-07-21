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

## Variable precedence [#environment-variable-precedence]

Appaloft resolves configuration in this order: defaults, system, organization, project, environment, deployment snapshot.

## Build-time and runtime variables [#environment-variable-build-vs-runtime]

Build-time variables can be included in build output and cannot be marked secret. Runtime variables are supplied to the running app, and secret values must be masked.

## Deployment snapshot [#environment-snapshot]

Each deployment persists an immutable environment snapshot.

## Diff and promote [#environment-diff]

Diff explains configuration differences. Promote creates a new target environment state instead of rewriting historical deployments.
