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

## Compare environments [#environment-diff]

Diff shows missing variables, changed values, and secret state differences between environments.

## Promote environment settings [#environment-promote]

Promote creates new configuration state for the target environment instead of changing historical deployments.

## Safety checks [#environment-promote-safety]

Confirm the target environment, secret handling, and whether a new deployment should be triggered.
