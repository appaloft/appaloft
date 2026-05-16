# Deployment Recovery Readiness Test Matrix

## Status

Active readiness-query matrix plus recovery-command matrix. `deployments.recovery-readiness`
has automated application and HTTP coverage. `deployments.retry`, `deployments.redeploy`, and
`deployments.rollback` are active write-command rows. `deployments.cancel` has a separate active
matrix because cancel mutates an existing active attempt instead of creating a recovery attempt.
`deployments.archive` and `deployments.prune` have a separate active matrix because they govern
terminal attempt visibility and destructive retention, not recovery admission.

The retry/redeploy write-command Code Round is scoped by
[Deployment Retry And Redeploy](../specs/040-deployment-retry-redeploy/spec.md). Rollback is scoped
by [Deployment Rollback](../specs/041-deployment-rollback/spec.md).

## Governing Sources

- [ADR-016: Deployment Command Surface Reset](../decisions/ADR-016-deployment-command-surface-reset.md)
- [ADR-029: Deployment Event Stream And Recovery Boundary](../decisions/ADR-029-deployment-event-stream-and-recovery-boundary.md)
- [ADR-034: Deployment Recovery Readiness](../decisions/ADR-034-deployment-recovery-readiness.md)
- [Deployment Recovery Readiness Spec](../specs/012-deployment-recovery-readiness/spec.md)
- [Deployment Observation And Recovery Hardening](../specs/071-deployment-observation-and-recovery/spec.md)
- [Deployment Recovery Readiness Plan](../specs/012-deployment-recovery-readiness/plan.md)
- [deployments.recovery-readiness Query Spec](../queries/deployments.recovery-readiness.md)
- [deployments.retry Command Spec](../commands/deployments.retry.md)
- [deployments.redeploy Command Spec](../commands/deployments.redeploy.md)
- [deployments.rollback Command Spec](../commands/deployments.rollback.md)
- [deployments.cancel Command Spec](../commands/deployments.cancel.md)
- [Deployments Cancel Test Matrix](./deployments.cancel-test-matrix.md)
- [deployments.archive Command Spec](../commands/deployments.archive.md)
- [deployments.prune Command Spec](../commands/deployments.prune.md)
- [Deployment Archive And Prune Test Matrix](./deployment-archive-prune-test-matrix.md)

## Readiness Query Coverage

| ID | Scenario | Expected assertion | Automation binding | Status |
| --- | --- | --- | --- | --- |
| `DEP-RECOVERY-READINESS-001` | Failed deployment has retained snapshot intent and runtime inputs. | Query returns `retryable = true`, safe read-only actions, and active retry command metadata. | `packages/application/test/deployment-recovery-readiness.test.ts` | Passing |
| `DEP-RECOVERY-READINESS-002` | Active or non-terminal deployment is inspected. | Query returns retry blocked with `attempt-not-terminal` and redeploy blocked with `resource-runtime-busy`. | `packages/application/test/deployment-recovery-readiness.test.ts` | Passing |
| `DEP-RECOVERY-READINESS-003` | Failed deployment has missing deployment snapshot. | Query returns retry blocked with `snapshot-missing` and does not offer retry as active command. | `packages/application/test/deployment-recovery-readiness.test.ts` | Passing |
| `DEP-RECOVERY-READINESS-004` | Current Resource profile is valid for a fresh deployment. | Query returns `redeployable = true` and active redeploy command metadata. | `packages/application/test/deployment-recovery-readiness.test.ts` via `DEP-RECOVERY-READINESS-001` fixture | Passing |
| `DEP-RECOVERY-READINESS-005` | Current Resource profile is invalid or drifted. | Query returns `redeployable = false` with a stable profile/drift blocked reason and a configuration repair suggestion. | `packages/application/test/deployment-recovery-readiness.test.ts` | Passing |
| `DEP-RECOVERY-READINESS-006` | Successful prior deployment retains snapshot, environment snapshot, target/destination identity, and artifact identity. | Query returns rollback candidate and `rollbackReady = true`. | `packages/application/test/deployment-recovery-readiness.test.ts` | Passing |
| `DEP-RECOVERY-READINESS-007` | Prior successful deployment has expired or missing artifact identity. | Query marks the candidate blocked with `runtime-artifact-missing`. | `packages/application/test/deployment-recovery-readiness.test.ts` | Passing |
| `DEP-RECOVERY-READINESS-008` | Prior successful deployment used an incompatible runtime target/destination. | Query blocks rollback with `rollback-candidate-target-mismatch`. | `packages/application/test/deployment-recovery-readiness.test.ts` | Passing |
| `DEP-RECOVERY-READINESS-009` | Deployment event stream reports reconnect gap. | Query result is based on durable state and is not made ready/blocked solely by the gap envelope. | covered by spec; no stream dependency in query service | Passing by construction |
| `DEP-RECOVERY-READINESS-010` | Rollback command is active in the operation catalog. | Query shows rollback readiness facts, allows rollback when a retained candidate is ready, and does not emit `recovery-command-not-active`. | `packages/application/test/deployment-recovery-readiness.test.ts` | Passing |
| `DEP-RECOVERY-READINESS-011` | Missing deployment is requested. | Query returns `not_found` with `queryName = deployments.recovery-readiness`. | `packages/application/test/deployment-recovery-readiness.test.ts` | Passing |

## Recovery Command Coverage

| ID | Scenario | Expected assertion | Automation binding | Status |
| --- | --- | --- | --- | --- |
| `DEP-RETRY-001` | Retry admitted for failed attempt with retained snapshot intent. | Command returns accepted async result with a new attempt id and emits normal lifecycle events with `triggerKind = "retry"`. | `packages/core/test/deployment.test.ts`; `packages/orpc/test/deployment-create.http.test.ts` | Passing |
| `DEP-RETRY-002` | Retry requested for active or successful attempt. | Command rejects with `deployment_not_retryable` and does not mutate the source attempt. | `packages/application/test/deployment-retry-redeploy.test.ts` | Passing |
| `DEP-RETRY-003` | Retry readiness marker is stale. | Command rejects with `deployment_recovery_state_stale`. | `packages/application/test/deployment-retry-redeploy.test.ts` | Passing |
| `DEP-RETRY-004` | Runtime operation is already in progress for the resource. | Command rejects or waits according to coordination policy without admitting competing retry work. | `packages/application/test/deployment-retry-redeploy.test.ts` | Passing |
| `DEP-REDEPLOY-001` | Redeploy admitted for current valid Resource profile. | Command returns accepted async result with a new attempt id and resolves runtime inputs from current profile state. | `packages/orpc/test/deployment-create.http.test.ts` | Passing |
| `DEP-REDEPLOY-002` | Source deployment has usable snapshot but current profile differs. | Command creates a current-profile attempt and does not reuse the old snapshot as runtime truth. | `packages/application/test/deployment-retry-redeploy.test.ts` | Passing |
| `DEP-REDEPLOY-003` | Source deployment has usable snapshot but current profile is invalid. | Command rejects redeploy; it does not fall back to retry semantics. | `packages/application/test/deployment-retry-redeploy.test.ts` | Passing |
| `DEP-REDEPLOY-004` | Runtime operation is already in progress for the resource. | Command rejects or waits according to coordination policy without bypassing create/retry/rollback serialization. | `packages/application/test/deployment-retry-redeploy.test.ts` | Passing |
| `DEP-ROLLBACK-001` | Rollback admitted with retained successful candidate. | Command returns accepted async result with a new rollback attempt id and emits `triggerKind = "rollback"` plus source/candidate metadata. | `packages/application/test/deployment-rollback.test.ts`, `packages/core/test/deployment.test.ts`, `packages/persistence/pg/test/deployment-repository.pglite.test.ts` | Passing |
| `DEP-ROLLBACK-002` | Requested rollback candidate is missing, expired, wrong-resource, or not visible. | Command rejects with `deployment_rollback_candidate_not_found`. | `packages/application/test/deployment-rollback.test.ts` | Passing |
| `DEP-ROLLBACK-003` | Requested candidate lacks artifact, snapshot, or safe stateless rollback support. | Command rejects with `deployment_not_rollback_ready` and safe missing metadata detail. | `packages/application/test/deployment-rollback.test.ts` | Passing |
| `DEP-ROLLBACK-004` | Rollback readiness marker is stale. | Command rejects with `deployment_recovery_state_stale`. | `packages/application/test/deployment-rollback.test.ts` | Passing |
| `DEP-ROLLBACK-005` | Runtime operation is already in progress for the resource. | Command rejects or waits according to coordination policy without admitting competing recovery work. | `packages/application/test/deployment-rollback.test.ts` | Passing |
| `DEP-ROLLBACK-ENTRY-001` | CLI, HTTP/oRPC, Web, and operation catalog expose rollback through the shared command schema. | Each entrypoint dispatches `RollbackDeploymentCommand` with deployment id, selected candidate id, optional resource id, and optional readiness freshness. | `packages/orpc/test/deployment-create.http.test.ts`, package typechecks | Passing |
| `DEP-CANCEL-*` | Cancel one active deployment attempt without deleting deployment history or creating a replacement attempt. | See dedicated matrix for running/planned/terminal/confirmation branches plus CLI and HTTP/oRPC entrypoints. | `docs/testing/deployments.cancel-test-matrix.md` | Passing/Pending as listed there |
| `DEP-ARCHIVE-*` / `DEP-PRUNE-*` | Archive terminal attempts and prune only archived, unguarded attempts through a dry-run-first retention boundary. | See dedicated matrix for terminal archive guard, default archive filtering, guarded PGlite retention, CLI, HTTP/oRPC, OpenAPI, and SDK entrypoints. | `docs/testing/deployment-archive-prune-test-matrix.md` | Passing/Pending as listed there |

## Entrypoint Coverage

| ID | Scenario | Expected assertion | Automation binding | Status |
| --- | --- | --- | --- | --- |
| `DEP-RECOVERY-WEB-001` | Web deployment detail renders failed deployment. | UI uses readiness query output for recovery cards, blocked reasons, retry/redeploy action buttons, and rollback candidate action gated by `allowed && commandActive`. | `apps/web` Svelte semantic check | Passing |
| `DEP-RECOVERY-CLI-001` | CLI inspects and acts on failed or active deployment. | CLI exposes read-only `appaloft deployments recovery-readiness <deploymentId>` plus active retry/redeploy/rollback/cancel commands over shared schemas. | CLI typecheck / operation catalog / `DEP-CANCEL-ENTRY-001` | Passing |
| `DEP-RECOVERY-HTTP-001` | HTTP/oRPC client requests readiness. | Response schema preserves booleans, candidate data, blocked reason codes, and generated state marker. | `packages/orpc/test/deployment-recovery-readiness.http.test.ts` | Passing |
| `DEP-RECOVERY-MCP-001` | Future tool asks for deployment recovery options. | Tool output can map directly to `recoverable`, `retryable`, `redeployable`, `rollbackReady`, and safe next actions without bespoke policy. | future MCP descriptor | Deferred gap |

## Current Implementation Notes And Migration Gaps

The active readiness query has application and HTTP/oRPC automated coverage plus CLI/Web type-level
coverage. Retry, redeploy, and rollback write commands are active across CLI, HTTP/oRPC, and Web.
The rebuilt cancel command and the terminal archive/prune commands are active across CLI and
HTTP/oRPC with public docs/help and typed client metadata; Web interactive button coverage remains a
quality follow-up rather than a hidden product gap.
Remaining deferred gaps belong to browser-flow coverage, future MCP descriptors, and any later
backend-specific artifact retention/prune-horizon evidence. The `0.12.x` hardening blocker rows for
readiness, retry, redeploy, rollback candidate compatibility, and command coordination are now
automated.
