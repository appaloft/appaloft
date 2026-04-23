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

<h2 id="observe-status-first">Check status first</h2>

Start with resource, deployment, runtime, proxy, and access route status before assuming the whole deployment failed.

<h2 id="observe-runtime-logs">Runtime logs</h2>

Runtime logs come from application stdout/stderr and help identify startup, port, configuration, and runtime failures.

<h2 id="observe-health-summary">Health summary</h2>

The health summary combines deployment, runtime, health policy, proxy, and public access observations.

<h2 id="diagnostic-summary-copy-support-payload">Copy diagnostic summary</h2>

Diagnostic summaries should include stable IDs, status, error codes, and safe context while masking secrets.

<h2 id="observe-safe-recovery">Safe recovery</h2>

Prefer retryable operations first. Change server, credential, proxy, or domain configuration only when the status explains why.
