---
title: "Observe and troubleshoot"
description: "Read status, events, runtime logs, access failures, and copyable diagnostic summaries."
docType: troubleshooting
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "logs"
  - "health"
  - "diagnostic"
  - "troubleshooting"
  - "status"
relatedOperations:
  - resources.health
  - resources.runtime-logs
  - resources.diagnostic-summary
  - deployments.show
sidebar:
  label: "Observe and troubleshoot"
  order: 8
---

## Check status first [#observe-status-first]

Start with resource, deployment, runtime, proxy, and access route status before assuming the whole deployment failed.

## Runtime logs [#observe-runtime-logs]

Runtime logs come from application stdout/stderr and help identify startup, port, configuration, and runtime failures.

## Health summary [#observe-health-summary]

The health summary combines deployment, runtime, health policy, proxy, and public access observations.

## Copy diagnostic summary [#diagnostic-summary-copy-support-payload]

Diagnostic summaries should include stable IDs, status, error codes, and safe context while masking secrets.

## Safe recovery [#observe-safe-recovery]

Prefer retryable operations first. Change server, credential, proxy, or domain configuration only when the status explains why.
