# Deployment Recovery Readiness Test Matrix

## Status

Active readiness-query matrix plus future recovery-command matrix. `deployments.recovery-readiness`
has automated application and HTTP coverage. `deployments.retry`, `deployments.redeploy`, and
`deployments.rollback` remain future write-command rows.

The retry/redeploy write-command Code Round is scoped by
[Deployment Retry And Redeploy](../specs/040-deployment-retry-redeploy/spec.md). Rollback remains a
separate future Code Round.

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

| ID | Scenario | Expected assertion | Automation binding | Status |
| --- | --- | --- | --- | --- |
| `DEP-RECOVERY-READINESS-001` | Failed deployment has retained snapshot intent and runtime inputs. | Query returns `retryable = true`, safe read-only actions, and active retry command metadata. | `packages/application/test/deployment-recovery-readiness.test.ts` | Passing |
| `DEP-RECOVERY-READINESS-002` | Active or non-terminal deployment is inspected. | Query returns retry blocked with `attempt-not-terminal` and redeploy blocked with `resource-runtime-busy`. | `packages/application/test/deployment-recovery-readiness.test.ts` | Passing |
| `DEP-RECOVERY-READINESS-003` | Failed deployment has missing deployment snapshot. | Query returns retry blocked with `snapshot-missing` and does not offer retry as active command. | planned application fixture | Deferred gap |
| `DEP-RECOVERY-READINESS-004` | Current Resource profile is valid for a fresh deployment. | Query returns `redeployable = true` and active redeploy command metadata. | `packages/application/test/deployment-recovery-readiness.test.ts` via `DEP-RECOVERY-READINESS-001` fixture | Passing |
| `DEP-RECOVERY-READINESS-005` | Current Resource profile is invalid or drifted. | Query returns `redeployable = false` with a stable profile/drift blocked reason and a configuration repair suggestion. | planned application fixture | Deferred gap |
| `DEP-RECOVERY-READINESS-006` | Successful prior deployment retains snapshot, environment snapshot, target/destination identity, and artifact identity. | Query returns rollback candidate and `rollbackReady = true`. | `packages/application/test/deployment-recovery-readiness.test.ts` | Passing |
| `DEP-RECOVERY-READINESS-007` | Prior successful deployment has expired or missing artifact identity. | Query marks the candidate blocked with `runtime-artifact-missing`. | `packages/application/test/deployment-recovery-readiness.test.ts` | Passing |
| `DEP-RECOVERY-READINESS-008` | Prior successful deployment used an incompatible runtime target/destination. | Query blocks rollback with `rollback-candidate-target-mismatch`. | planned after target compatibility metadata | Deferred gap |
| `DEP-RECOVERY-READINESS-009` | Deployment event stream reports reconnect gap. | Query result is based on durable state and is not made ready/blocked solely by the gap envelope. | covered by spec; no stream dependency in query service | Passing by construction |
| `DEP-RECOVERY-READINESS-010` | Rollback command is not active in the operation catalog. | Query may show rollback readiness facts but rollback next actions identify unavailable command state with `recovery-command-not-active`. | `packages/application/test/deployment-recovery-readiness.test.ts` | Passing |
| `DEP-RECOVERY-READINESS-011` | Missing deployment is requested. | Query returns `not_found` with `queryName = deployments.recovery-readiness`. | `packages/application/test/deployment-recovery-readiness.test.ts` | Passing |

## Recovery Command Coverage

| ID | Scenario | Expected assertion | Automation binding | Status |
| --- | --- | --- | --- | --- |
| `DEP-RETRY-001` | Retry admitted for failed attempt with retained snapshot intent. | Command returns accepted async result with a new attempt id and emits normal lifecycle events with `triggerKind = "retry"`. | `packages/core/test/deployment.test.ts`; `packages/orpc/test/deployment-create.http.test.ts` | Passing |
| `DEP-RETRY-002` | Retry requested for active or successful attempt. | Command rejects with `deployment_not_retryable` and does not mutate the source attempt. | planned application fixture | Deferred gap |
| `DEP-RETRY-003` | Retry readiness marker is stale. | Command rejects with `deployment_recovery_state_stale`. | planned application fixture | Deferred gap |
| `DEP-RETRY-004` | Runtime operation is already in progress for the resource. | Command rejects or waits according to coordination policy without admitting competing retry work. | planned coordination fixture | Deferred gap |
| `DEP-REDEPLOY-001` | Redeploy admitted for current valid Resource profile. | Command returns accepted async result with a new attempt id and resolves runtime inputs from current profile state. | `packages/orpc/test/deployment-create.http.test.ts` | Passing |
| `DEP-REDEPLOY-002` | Source deployment has usable snapshot but current profile differs. | Command creates a current-profile attempt and does not reuse the old snapshot as runtime truth. | planned application fixture | Deferred gap |
| `DEP-REDEPLOY-003` | Source deployment has usable snapshot but current profile is invalid. | Command rejects redeploy; it does not fall back to retry semantics. | planned application fixture | Deferred gap |
| `DEP-REDEPLOY-004` | Runtime operation is already in progress for the resource. | Command rejects or waits according to coordination policy without bypassing create/retry/rollback serialization. | planned coordination fixture | Deferred gap |
| `DEP-ROLLBACK-001` | Rollback admitted with retained successful candidate. | Command returns accepted async result with a new rollback attempt id and emits `triggerKind = "rollback"`. | future rollback Code Round | Deferred gap |
| `DEP-ROLLBACK-002` | Requested rollback candidate is missing or expired. | Command rejects with `deployment_rollback_candidate_not_found`. | future rollback Code Round | Deferred gap |
| `DEP-ROLLBACK-003` | Requested candidate lacks artifact or environment snapshot. | Command rejects with `deployment_not_rollback_ready` and safe missing metadata detail. | future rollback Code Round | Deferred gap |
| `DEP-ROLLBACK-004` | Runtime operation is already in progress for the resource. | Command rejects or waits according to coordination policy without admitting competing recovery work. | future rollback Code Round | Deferred gap |

## Entrypoint Coverage

| ID | Scenario | Expected assertion | Automation binding | Status |
| --- | --- | --- | --- | --- |
| `DEP-RECOVERY-WEB-001` | Web deployment detail renders failed deployment. | UI uses readiness query output for recovery cards, blocked reasons, and retry/redeploy action buttons gated by `allowed && commandActive`; rollback remains status-only. | `apps/web` Svelte semantic check | Passing |
| `DEP-RECOVERY-CLI-001` | CLI inspects failed deployment interactively. | CLI exposes read-only `appaloft deployments recovery-readiness <deploymentId>` and prints readiness output from the shared query. | CLI typecheck / operation catalog | Passing |
| `DEP-RECOVERY-HTTP-001` | HTTP/oRPC client requests readiness. | Response schema preserves booleans, candidate data, blocked reason codes, and generated state marker. | `packages/orpc/test/deployment-recovery-readiness.http.test.ts` | Passing |
| `DEP-RECOVERY-MCP-001` | Future tool asks for deployment recovery options. | Tool output can map directly to `recoverable`, `retryable`, `redeployable`, `rollbackReady`, and safe next actions without bespoke policy. | future MCP descriptor | Deferred gap |

## Current Implementation Notes And Migration Gaps

The active readiness query has application and HTTP/oRPC automated coverage plus CLI/Web type-level
coverage. Retry and redeploy write commands are active across CLI, HTTP/oRPC, and Web. Remaining
deferred gaps belong to rollback, richer target compatibility metadata, artifact retention/prune
policy, coordination fixtures, browser-flow coverage, and future MCP descriptors.
