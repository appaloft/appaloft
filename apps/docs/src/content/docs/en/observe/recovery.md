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

## Safe recovery [#observe-safe-recovery]

Prefer retryable operations. Change servers, credentials, proxies, or domains only when status indicates manual repair is required.

Safe recovery starts with explainability: identify the failed step, the resources already changed, and whether a rollback target still exists before running the next operation.

> Warning: Do not retry, edit the server, change DNS, and replace secrets all at once. Change one variable at a time so the recovery path remains verifiable.

## Retry policy [#observe-retry-policy]

Temporary network, pull, and execution failures can often be retried. Input, credential, DNS, and certificate material issues need repair first.

| Signal | Recommended action |
| --- | --- |
| `retryable` error or occasional health-check failure | Retry directly and check whether it reaches the same failure point. |
| Missing input, missing path, or wrong build command | Fix deployment inputs, then deploy again. |
| Credential, SSH, registry, DNS, or certificate error | Repair the external configuration, then verify connectivity. |
| New version already owns traffic and cannot recover | Roll back to the last working version, then investigate the failed run. |

## Read current state [step]

Open resource status, latest deployment status, the event timeline, and the health summary. Record the last failed phase, error code, retry guidance, and whether the access URL has already switched.

## Decide whether to retry [step]

Temporary network failures, image pulls, command timeouts, and occasional health-check failures can usually be retried. Missing secrets, invalid domains, unreachable SSH, bad certificate material, and invalid inputs usually need repair first.

## Repair the smallest input [step]

Change only the input directly related to the error code, such as one secret, one DNS record, one SSH key, or one build directory. Keep the original failure record so the next run can be compared against it.

## Roll back when needed [step]

If the new deployment already affected the access URL or runtime state and cannot be repaired quickly, roll back to the last verified version. Keep the failed deployment logs and diagnostic summary for follow-up.
