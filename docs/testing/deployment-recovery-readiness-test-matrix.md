# Deployment Recovery Readiness Test Matrix

## Status

Spec Round matrix. These scenarios define required future tests before activating
`deployments.recovery-readiness`, `deployments.retry`, `deployments.redeploy`, or
`deployments.rollback`.

## Governing Sources

- [ADR-016: Deployment Command Surface Reset](../decisions/ADR-016-deployment-command-surface-reset.md)
- [ADR-029: Deployment Event Stream And Recovery Boundary](../decisions/ADR-029-deployment-event-stream-and-recovery-boundary.md)
- [ADR-034: Deployment Recovery Readiness](../decisions/ADR-034-deployment-recovery-readiness.md)
- [Deployment Recovery Readiness Spec](../specs/012-deployment-recovery-readiness/spec.md)
- [Deployment Recovery Readiness Plan](../specs/012-deployment-recovery-readiness/plan.md)
- [deployments.recovery-readiness Query Spec](../queries/deployments.recovery-readiness.md)
- [deployments.retry Command Spec](../commands/deployments.retry.md)
- [deployments.redeploy Command Spec](../commands/deployments.redeploy.md)
- [deployments.rollback Command Spec](../commands/deployments.rollback.md)

## Readiness Query Coverage

| ID | Scenario | Expected assertion |
| --- | --- | --- |
| `DEP-RECOVERY-READINESS-001` | Failed deployment has retained snapshot intent and runtime inputs. | Query returns `retry.ready = true`, safe retry action, and no rollback readiness unless a retained successful candidate exists. |
| `DEP-RECOVERY-READINESS-002` | Active or non-terminal deployment is inspected. | Query returns retry/rollback blocked with `attempt-not-terminal` and suggests event/detail observation. |
| `DEP-RECOVERY-READINESS-003` | Failed deployment has missing deployment snapshot. | Query returns retry blocked with `snapshot-missing` and does not offer retry as safe action. |
| `DEP-RECOVERY-READINESS-004` | Current Resource profile is valid for a fresh deployment. | Query returns `redeploy.ready = true` even when the inspected attempt snapshot is unusable. |
| `DEP-RECOVERY-READINESS-005` | Current Resource profile is invalid or drifted. | Query returns `redeploy.ready = false` with a stable profile/drift blocked reason and a configuration repair suggestion. |
| `DEP-RECOVERY-READINESS-006` | Successful prior deployment retains snapshot, environment snapshot, target/destination identity, and artifact identity. | Query returns rollback candidate and `rollback.ready = true`. |
| `DEP-RECOVERY-READINESS-007` | Prior successful deployment has expired or missing artifact identity. | Query excludes or marks the candidate blocked with `runtime-artifact-missing` or `rollback-candidate-expired`. |
| `DEP-RECOVERY-READINESS-008` | Prior successful deployment used an incompatible runtime target/destination. | Query blocks rollback with `rollback-candidate-target-mismatch`. |
| `DEP-RECOVERY-READINESS-009` | Deployment event stream reports reconnect gap. | Query result is based on durable state and is not made ready/blocked solely by the gap envelope. |
| `DEP-RECOVERY-READINESS-010` | Recovery command is not active in the operation catalog. | Query may show readiness facts but next actions identify unavailable command state with `recovery-command-not-active`. |

## Recovery Command Coverage

| ID | Scenario | Expected assertion |
| --- | --- | --- |
| `DEP-RETRY-001` | Retry admitted for failed attempt with retained snapshot intent. | Command returns accepted async result with a new attempt id and emits normal lifecycle events with `triggerKind = "retry"`. |
| `DEP-RETRY-002` | Retry requested for active or successful attempt. | Command rejects with `deployment_not_retryable` and does not mutate the source attempt. |
| `DEP-RETRY-003` | Retry readiness marker is stale. | Command rejects with `deployment_recovery_state_stale`. |
| `DEP-REDEPLOY-001` | Redeploy admitted for current valid Resource profile. | Command returns accepted async result with a new attempt id and resolves runtime inputs from current profile state. |
| `DEP-REDEPLOY-002` | Source deployment has usable snapshot but current profile is invalid. | Command rejects redeploy; it does not fall back to retry semantics. |
| `DEP-ROLLBACK-001` | Rollback admitted with retained successful candidate. | Command returns accepted async result with a new rollback attempt id and emits `triggerKind = "rollback"`. |
| `DEP-ROLLBACK-002` | Requested rollback candidate is missing or expired. | Command rejects with `deployment_rollback_candidate_not_found`. |
| `DEP-ROLLBACK-003` | Requested candidate lacks artifact or environment snapshot. | Command rejects with `deployment_not_rollback_ready` and safe missing metadata detail. |
| `DEP-ROLLBACK-004` | Runtime operation is already in progress for the resource. | Command rejects or waits according to coordination policy without admitting competing recovery work. |

## Entrypoint Coverage

| ID | Scenario | Expected assertion |
| --- | --- | --- |
| `DEP-RECOVERY-WEB-001` | Web deployment detail renders failed deployment. | UI uses readiness query output for recovery cards and blocked reasons; no hardcoded recovery branching in components. |
| `DEP-RECOVERY-CLI-001` | CLI inspects failed deployment interactively. | CLI presents retry/redeploy/rollback suggestions only from readiness output and includes read-only inspection commands when blocked. |
| `DEP-RECOVERY-HTTP-001` | HTTP/oRPC client requests readiness. | Response schema preserves booleans, candidate data, blocked reason codes, and generated state marker. |
| `DEP-RECOVERY-MCP-001` | Future tool asks for deployment recovery options. | Tool output can map directly to `recoverable`, `retryable`, `redeployable`, `rollbackReady`, and safe next actions without bespoke policy. |

## Current Implementation Notes And Migration Gaps

No executable tests are required in this Spec Round. The next Test-First Round should create focused
application/query tests for the readiness policy before any Web/API/CLI entrypoint enables recovery
actions.
