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
  - "cancel"
  - "rollback"
relatedOperations:
  - deployments.recovery-readiness
  - deployments.retry
  - deployments.redeploy
  - deployments.rollback
  - deployments.cancel
  - deployments.archive
  - deployments.prune
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

<h2 id="deployment-recovery-readiness">Check deployment recovery readiness</h2>

When a deployment fails, is canceled, or has an interrupted observation stream, inspect recovery readiness before running retry or rollback actions:

```bash
appaloft deployments recovery-readiness <deploymentId>
```

This query is read-only. It returns:

- machine-readable `recoverable`, `retryable`, `redeployable`, and `rollbackReady` fields;
- blocked reasons for `retry`, `redeploy`, and `rollback`, plus context for whether an active attempt should be canceled;
- rollback candidates and whether a candidate is missing artifact or snapshot data;
- safe next actions such as opening detail, logs, the event stream, or a diagnostic summary.

The `retry`, `redeploy`, `rollback`, and active-attempt `cancel` write commands are active. Recovery commands are still blocked when readiness reports missing snapshots, missing artifacts, stale readiness, an active runtime operation, or an incompatible candidate.

<h2 id="agent-deploy-recovery">Agent deploy recovery</h2>

An agent should not retry immediately after a failure. It should read recovery readiness first and
return blocked reasons, available candidates, and safe next actions. Only suggest retry, redeploy, or
rollback when readiness explicitly allows it.

If readiness asks for logs or diagnostics first, the agent should return those commands instead of
directly mutating runtime, remote state, or secrets.

<h2 id="deployment-recovery-retry">Retry</h2>

Retry means creating a new deployment attempt from the failed deployment's immutable snapshot intent. It does not replay old events and does not resume a failed phase inside the old attempt.

Run `appaloft deployments retry <deploymentId>` or call `POST /api/deployments/{deploymentId}/retry` after checking readiness.

<h2 id="deployment-recovery-redeploy">Redeploy</h2>

Redeploy means deploying the current Resource profile again. It reads the current resource configuration, environment configuration, target, and destination. It does not reuse the old deployment snapshot.

If the current Resource profile is missing, drifted, or no longer admissible, readiness marks redeploy as blocked.

Run `appaloft deployments redeploy <resourceId>` or call `POST /api/resources/{resourceId}/redeploy` after checking readiness.

<h2 id="deployment-recovery-rollback">Rollback</h2>

Rollback means creating a new rollback attempt from a historical successful deployment snapshot and Docker/OCI artifact. It does not re-plan from the current Resource profile and does not restore databases, volumes, queues, or external dependency state.

Run `appaloft deployments rollback <deploymentId> --candidate <candidateDeploymentId>` or call `POST /api/deployments/{deploymentId}/rollback` after checking readiness and selecting a rollback-ready candidate.

<h2 id="deployment-recovery-cancel">Cancel</h2>

Cancel stops one non-terminal deployment attempt. It does not delete deployment history, logs, events, runtime artifacts, route intent, the Resource, or environment configuration.

Run `appaloft deployments cancel <deploymentId> --confirm <deploymentId>` or call `POST /api/deployments/{deploymentId}/cancel`. The confirmation value must exactly match the deployment id. Terminal attempts such as succeeded, failed, canceled, or rolled-back deployments are rejected.

<h2 id="deployment-recovery-archive-prune">Archive and prune attempts</h2>

Archive hides a terminal deployment attempt from default history without deleting logs, events, runtime artifacts, provider job logs, audit rows, route state, rollback candidates, or operator-work evidence. Run `appaloft deployments archive <deploymentId> --confirm <deploymentId>` or call `POST /api/deployments/{deploymentId}/archive`.

Prune is dry-run-first. Run `appaloft deployments prune --before <iso>` or call `POST /api/deployments/prune`. Destructive prune requires `dryRun: false` and deletes only archived terminal attempts that are older than the cutoff and have no retained source, retry, rollback, supersede, provider-log, runtime-log, or runtime-control references.

<h2 id="deployment-recovery-rollback-candidates">Rollback candidates</h2>

A rollback candidate must be a historical successful deployment for the same resource and must still retain:

- deployment snapshot;
- environment snapshot;
- runtime target / destination identity;
- Docker/OCI artifact identity such as image, digest, local image id, or Compose artifact.

If the artifact was pruned, the snapshot is incomplete, the target is incompatible, or recovery would require data/volume rollback, readiness returns a blocked reason and suggests choosing another candidate, redeploying, or running diagnostics first.

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

The Web console places recovery actions near deployment status. The CLI fits preview cleanup, source relink, retry, redeploy, rollback, and cancel. The HTTP API exposes machine-readable status, error codes, and recovery hints.

Recovery should not require direct database edits or manual runtime state deletion.
