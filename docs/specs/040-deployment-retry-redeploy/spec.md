# Deployment Retry And Redeploy

## Status

- Round: Spec Round
- Artifact state: planned for Code Round
- Roadmap target: Phase 7 / `0.9.0` beta, Day-Two Production Controls
- Compatibility impact: `pre-1.0-policy`, additive recovery write commands and public entrypoints
- Decision state: governed by ADR-016 and ADR-034; no new ADR required for this slice because the
  command boundaries, recovery readiness contract, errors, and async semantics are already accepted

## Business Outcome

Operators can start a new deployment attempt from either:

- a failed deployment attempt's retained immutable snapshot intent (`deployments.retry`); or
- the current Resource profile and current effective configuration (`deployments.redeploy`).

This slice reintroduces only retry and redeploy under ADR-016. Rollback remains a separate Phase 7
Code Round because it depends on retained artifact/candidate execution semantics.

## Ubiquitous Language

| Term | Meaning | Context |
| --- | --- | --- |
| Retry | New deployment attempt from the selected failed/interrupted/canceled/superseded attempt's retained immutable snapshot intent. | Release orchestration |
| Redeploy | New deployment attempt from the current Resource profile, current effective configuration, current environment, and selected runtime target context. | Release orchestration / Workload Delivery |
| Source deployment | Existing deployment detail from which an operator initiated retry or redeploy. Retry uses it as runtime truth; redeploy uses it only as optional UX/audit context. | Release orchestration |
| Recovery admission | Write-side re-evaluation of readiness and coordination before accepting retry/redeploy work. | Application |
| Recovery trigger | Safe metadata on the new attempt identifying whether it was created by `create`, `retry`, or `redeploy`. | Deployment attempt |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| DEP-RETRY-001 | Retry admitted for recoverable failed attempt | A failed deployment has complete runtime plan, environment snapshot, target/destination identity, and retry readiness is still current | `deployments.retry` runs | A new deployment attempt id is created, `triggerKind = retry`, `sourceDeploymentId` points to the failed attempt, normal deployment lifecycle events are emitted, and the old attempt is not mutated. |
| DEP-RETRY-002 | Retry rejected for non-retryable attempt | Source attempt is active, succeeded, non-terminal, non-recoverable, missing snapshot/runtime inputs, or belongs to the wrong resource | `deployments.retry` runs | Command returns `deployment_not_retryable` or `not_found`, no new deployment is created, and no runtime execution starts. |
| DEP-RETRY-003 | Retry rejects stale readiness marker | Client submits `readinessGeneratedAt` that does not match durable source attempt state | `deployments.retry` runs | Command returns `deployment_recovery_state_stale`, no new attempt is created, and caller must re-read `deployments.recovery-readiness`. |
| DEP-RETRY-004 | Retry coordinates resource runtime | Same resource/target/destination has active deployment work | `deployments.retry` runs | Command waits or rejects according to resource-runtime coordination policy; it does not admit competing recovery work. |
| DEP-REDEPLOY-001 | Redeploy admitted from current profile | Resource, environment, target, destination, source, runtime profile, network/access profile, and effective config are currently deployable | `deployments.redeploy` runs | A new deployment attempt id is created, `triggerKind = redeploy`, runtime plan is resolved from current Resource profile, and normal deployment lifecycle events are emitted. |
| DEP-REDEPLOY-002 | Redeploy does not reuse old snapshot | Source deployment has a retained snapshot but current Resource profile differs | `deployments.redeploy` runs with `sourceDeploymentId` | New attempt uses current Resource profile/current effective config; the source deployment is only recorded as optional audit context. |
| DEP-REDEPLOY-003 | Redeploy rejected when current profile is invalid | Current Resource profile, lifecycle, environment, target, destination, or profile-drift policy blocks deployment admission | `deployments.redeploy` runs | Command returns `deployment_not_redeployable` or the existing owning admission error; it does not fall back to retry semantics. |
| DEP-REDEPLOY-004 | Redeploy coordinates resource runtime | Same resource/target/destination has active deployment work | `deployments.redeploy` runs | Command waits or rejects according to resource-runtime coordination policy; it does not bypass `deployments.create` supersede/fencing rules. |
| DEP-RECOVERY-ENTRY-001 | Retry/redeploy entrypoints are explicit | Operation catalog, CLI, HTTP/oRPC, Web, and docs are inspected after Code Round | Retry/redeploy are active | Each surface dispatches explicit command messages, reuses application schemas, links to public docs/help anchors, and does not expose rollback or cancel. |

## Public Surfaces

- CLI:
  - `appaloft deployments retry <deploymentId>`
  - `appaloft deployments redeploy <resourceId>`
- HTTP/oRPC:
  - `POST /api/deployments/{deploymentId}/retries`
  - `POST /api/resources/{resourceId}/redeployments`
- Web:
  - Deployment detail recovery panel may enable retry/redeploy actions only when
    `deployments.recovery-readiness` says the action is technically ready and the operation catalog
    marks the command active.
- Public docs/help:
  - Reuse existing stable anchors `deployment-recovery-retry` and `deployment-recovery-redeploy` in
    `apps/docs/src/content/docs/deploy/recovery.md` and localized counterpart.
- Future MCP/tools:
  - One tool per operation key over the same application schemas.

## Domain Ownership

- Bounded context: Release orchestration.
- Aggregate owner: `Deployment` owns attempt state, immutable snapshot, runtime plan, recovery
  trigger metadata, source deployment links, lifecycle events, logs, and terminal result.
- Related context: `Resource` owns the current profile used by redeploy.
- Application owner: retry/redeploy use cases coordinate recovery readiness re-evaluation,
  resource-runtime mutation coordination, new attempt creation, event publication, runtime backend
  execution, and terminal failure/success persistence.
- Runtime target owner: runtime adapters execute already-accepted deployment attempts. They do not
  decide retry/redeploy admission.

## Command Semantics

### `deployments.retry`

- Loads the source deployment by id.
- Re-evaluates retry readiness server-side from durable state.
- Creates a new attempt from the source deployment's retained runtime plan, environment snapshot,
  target/destination ids, and dependency binding snapshot references.
- Does not run source detection or re-plan from the current Resource profile.
- Does not mutate the source attempt except for existing supersede/cancellation state on any active
  runtime-owning attempt that must be superseded by normal deployment coordination.

### `deployments.redeploy`

- Resolves current project/environment/resource/target/destination context.
- Runs the same current-profile detection, planning, dependency-binding snapshot reference, route,
  runtime target capability, supersede, execution, and terminal persistence pipeline as
  `deployments.create`.
- `sourceDeploymentId` is optional context only. It never becomes the source of runtime truth.
- Does not accept source/runtime/network/profile override fields.

## Failure Semantics

- `validation_error`, phase `deployment-recovery-validation`
- `not_found`, phase `deployment-resolution`, `resource-resolution`, or context resolution
- `deployment_not_retryable`, phase `recovery-admission`
- `deployment_not_redeployable`, phase `recovery-admission`
- `deployment_recovery_state_stale`, phase `recovery-admission`
- `coordination_timeout`, phase `operation-coordination`
- Existing deployment create/runtime errors keep their owning code and phase when redeploy reaches
  the current-profile deployment pipeline.

All error details must be safe and include only deployment id, resource id, target/destination ids,
readiness reason codes, command name, phase, and safe state markers.

## Non-Goals

- No rollback command in this slice.
- No public cancel, reattach, manual health check, or rerun-one-phase command.
- No stateful data rollback, dependency resource restore, volume restore, or secret rollback.
- No event replay as retry.
- No deployment-owned source/runtime/network/profile override fields.
- No automatic recovery scheduler.

## Current Implementation Notes And Migration Gaps

- `deployments.create` currently contains the full context-resolution, detect, plan, supersede,
  execution, and terminal persistence pipeline. Code Round should extract or reuse a shared
  application service so redeploy does not duplicate this pipeline.
- Retry can reuse retained snapshot/runtime plan state, but Code Round must add explicit recovery
  trigger metadata to `Deployment` with value objects instead of loose primitive state.
- Recovery readiness currently marks retry/redeploy commands inactive. Code Round must flip command
  active state only after operation catalog, entrypoints, docs/help, and tests are synchronized.
- Rollback remains future work and must keep `recovery-command-not-active` until its own Code Round.
