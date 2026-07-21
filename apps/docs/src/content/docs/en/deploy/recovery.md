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
  - deployments.stale-attempts
  - deployments.reconcile-stale
  - deployments.archive
  - deployments.prune
  - source-links.relink
  - deployments.cleanup-preview
sidebar:
  label: "Recovery"
  order: 4
---

## Relink a deployment source [#deployment-source-relink]

Source relink is an explicit recovery action when a resource points at an unavailable source or needs to move to another repository, path, or image.

Confirm the target resource, current source, new source, and expected environment before relinking.

Do not treat relink as a normal retry. Relink changes what later deployments read as source. It fits repository moves, directory reorganizations, image source changes, or invalid local source fingerprints.

## Clean preview deployments [#deployment-preview-cleanup]

Preview cleanup removes deployments created for a pull request, branch, or temporary source. The target must be located by preview type and preview id.

After cleanup, check:

- The preview runtime instance stopped.
- The preview access URL is no longer shown as active.
- Production deployments and normal history were not affected.
- A later preview with the same id can be created again.

## Check deployment recovery readiness [#deployment-recovery-readiness]

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

## Agent deploy recovery [#agent-deploy-recovery]

An agent should not retry immediately after a failure. It should read recovery readiness first and
return blocked reasons, available candidates, and safe next actions. Only suggest retry, redeploy, or
rollback when readiness explicitly allows it.

If readiness asks for logs or diagnostics first, the agent should return those commands instead of
directly mutating runtime, remote state, or secrets.

## Retry [#deployment-recovery-retry]

Retry means creating a new deployment attempt from the failed deployment's immutable snapshot intent. It does not replay old events and does not resume a failed phase inside the old attempt.

Run `appaloft deployments retry <deploymentId>` or call `POST /api/deployments/{deploymentId}/retry` after checking readiness.

## Redeploy [#deployment-recovery-redeploy]

Redeploy means deploying the current Resource profile again. It reads the current resource configuration, environment configuration, target, and destination. It does not reuse the old deployment snapshot.

If the current Resource profile is missing, drifted, or no longer admissible, readiness marks redeploy as blocked.

Run `appaloft deployments redeploy <resourceId>` or call `POST /api/resources/{resourceId}/redeploy` after checking readiness.

## Force redeploy [#deployment-recovery-force-redeploy]

Force redeploy means deploying the current Resource profile again while forcing runtime artifact refresh. Docker builds use pull/no-cache behavior; Compose builds run a forced build first; prebuilt images are explicitly pulled.

It does not change the Resource profile and it does not deploy automatically after variable saves. Run `appaloft deployments force-redeploy <resourceId>` or call `POST /api/resources/{resourceId}/force-redeploy`.

## Rollback [#deployment-recovery-rollback]

Rollback means creating a new rollback attempt from a historical successful deployment snapshot and Docker/OCI artifact. It does not re-plan from the current Resource profile and does not restore databases, volumes, queues, or external dependency state.

Run `appaloft deployments rollback <deploymentId> --candidate <candidateDeploymentId>` or call `POST /api/deployments/{deploymentId}/rollback` after checking readiness and selecting a rollback-ready candidate.

## Cancel [#deployment-recovery-cancel]

Cancel stops one non-terminal deployment attempt. It does not delete deployment history, logs, events, runtime artifacts, route intent, the Resource, or environment configuration.

Run `appaloft deployments cancel <deploymentId> --confirm <deploymentId>` or call `POST /api/deployments/{deploymentId}/cancel`. The confirmation value must exactly match the deployment id. Terminal attempts such as succeeded, failed, canceled, or rolled-back deployments are rejected.

## Reconcile an attempt with no durable activity [#deployment-recovery-stale-attempts]

When a deployment remains created, planning, planned, running, or cancel-requested, first run
`appaloft deployments stale --stale-after-seconds 900`. The query uses durable deployment status
and timeline activity; a disconnected browser or log stream never mutates the attempt.

After confirming that execution ownership was lost, pass the returned `stateVersion`:

```bash
appaloft deployments reconcile-stale <deploymentId> \
  --state-version <stateVersion> \
  --stale-after-seconds 900 \
  --confirm <deploymentId>
```

The command re-reads state under resource-runtime coordination. New activity, a changed state
version, a threshold that is no longer met, or a terminal attempt causes rejection. Success marks
the historical attempt `interrupted` while preserving its timeline and recovery evidence. Use
recovery readiness before retrying or redeploying.

## Archive and prune attempts [#deployment-recovery-archive-prune]

Archive hides a terminal deployment attempt from default history without deleting logs, events, runtime artifacts, provider job logs, audit rows, route state, rollback candidates, or operator-work evidence. Run `appaloft deployments archive <deploymentId> --confirm <deploymentId>` or call `POST /api/deployments/{deploymentId}/archive`.

Prune is dry-run-first. Run `appaloft deployments prune --before <iso>` or call `POST /api/deployments/prune`. Destructive prune requires `dryRun: false` and deletes only archived terminal attempts that are older than the cutoff and have no retained source, retry, rollback, supersede, provider-log, runtime-log, or runtime-control references.

## Rollback candidates [#deployment-recovery-rollback-candidates]

A rollback candidate must be a historical successful deployment for the same resource and must still retain:

- deployment snapshot;
- environment snapshot;
- runtime target / destination identity;
- Docker/OCI artifact identity such as image, digest, local image id, or Compose artifact.

If the artifact was pruned, the snapshot is incomplete, the target is incompatible, or recovery would require data/volume rollback, readiness returns a blocked reason and suggests choosing another candidate, redeploying, or running diagnostics first.

## Retry or rollback [#deployment-retry-or-rollback]

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

## Entrypoint differences [#deployment-recovery-surfaces]

The Web console places recovery actions near deployment status. The CLI fits preview cleanup, source relink, retry, redeploy, rollback, and cancel. The HTTP API exposes machine-readable status, error codes, and recovery hints.

Recovery should not require direct database edits or manual runtime state deletion.
