---
title: "Safe recovery"
description: "Choose retry, repair, or rollback based on status, logs, and diagnostics."
docType: troubleshooting
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "recovery"
  - "retry"
  - "rollback"
relatedOperations:
  - deployments.create
sidebar:
  label: "Safe recovery"
  order: 5
---

<h2 id="observe-safe-recovery">Safe recovery</h2>

Prefer retryable operations. Change servers, credentials, proxies, or domains only when status indicates manual repair is required.

<h2 id="observe-retry-policy">Retry policy</h2>

Temporary network, pull, and execution failures can often be retried. Input, credential, DNS, and certificate material issues need repair first.
