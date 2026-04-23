---
title: "Deployment recovery"
description: "Relink sources, clean preview deployments, and decide whether to retry, fix, or roll back."
docType: troubleshooting
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "relink"
  - "preview cleanup"
  - "retry"
  - "rollback"
relatedOperations:
  - source-links.relink
  - deployments.cleanup-preview
sidebar:
  label: "Recovery"
  order: 4
---

<h2 id="deployment-source-relink">Relink a deployment source</h2>

Source relink is an explicit recovery action when a resource points at an unavailable source or needs to move to another repository, path, or image.

Confirm the target resource, current source, new source, and expected environment before relinking.

Do not treat relink as a normal retry. Relink changes what later deployments read as source. It fits repository moves, directory reorganizations, image source changes, or invalid local source fingerprints.

<h2 id="deployment-preview-cleanup">Clean preview deployments</h2>

Preview cleanup removes deployments created for a pull request, branch, or temporary source. The target must be located by preview type and preview id.

After cleanup, check:

- The preview runtime instance stopped.
- The preview access URL is no longer shown as active.
- Production deployments and normal history were not affected.
- A later preview with the same id can be created again.

<h2 id="deployment-retry-or-rollback">Retry or rollback</h2>

Fix validation failures first. Retry temporary execution failures. For verify failures, inspect health and logs before choosing repair, retry, or rollback.

Recommended decisions:

| Symptom | First action |
| --- | --- |
| Source cannot be read | Fix source or relink. |
| Runtime/profile mismatch | Fix resource profile and redeploy. |
| SSH or server execution failed | Run connectivity checks and inspect server diagnostics. |
| App starts but health check fails | Inspect logs and health profile. |
| Generated access fails | Check proxy readiness and network profile. |
| Custom domain fails | Verify generated access first, then inspect DNS/TLS. |

<h2 id="deployment-recovery-surfaces">Entrypoint differences</h2>

The Web console should place recovery actions near resource, deployment, or access status. The CLI fits preview cleanup, source relink, and retry. The HTTP API should expose machine-readable status, error codes, and recovery hints.

Recovery should not require direct database edits or manual runtime state deletion.
