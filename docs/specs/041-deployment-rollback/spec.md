# Deployment Rollback

## Status

- Round: Spec Round
- Artifact state: Code Round active
- Roadmap target: Phase 7 / `0.9.0` beta, Day-Two Production Controls
- Compatibility impact: `pre-1.0-policy`, additive recovery write command and public entrypoints
- Decision state: governed by ADR-016 and ADR-034; no new ADR required for this slice because
  rollback command boundaries, candidate readiness, non-goals, errors, and async observation
  semantics are already accepted

## Business Outcome

Operators can replace the current runtime with a previously successful deployment attempt when
Appaloft can prove that the selected candidate still has safe retained runtime artifact and snapshot
identity.

Rollback creates a new deployment attempt. It does not mutate the successful historical candidate,
does not replay events into the failed attempt, and does not restore databases, volumes, dependency
resources, queues, or secrets.

## Ubiquitous Language

| Term | Meaning | Context |
| --- | --- | --- |
| Rollback | New deployment attempt from a retained successful deployment candidate's immutable snapshot and runtime artifact identity. | Release orchestration |
| Rollback candidate | Successful historical deployment for the same resource with retained runtime plan, environment snapshot, target/destination identity, and artifact identity. | Deployment recovery readiness |
| Selected candidate | Candidate deployment id explicitly chosen by the operator or defaulted from readiness recommendation. | Application |
| Runtime artifact identity | Safe identity needed by the runtime backend to apply the candidate workload, such as image tag/digest/local image id or Compose project/service artifact identity. | Runtime adapter boundary |
| Stateful data rollback | Restoring database, volume, queue, dependency-resource, or secret state to a prior value. | Explicit non-goal |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| DEP-ROLLBACK-001 | Rollback admitted with retained successful candidate | Recovery readiness lists a successful same-resource candidate with complete runtime plan, environment snapshot, target/destination identity, retained artifact identity, and a fresh readiness marker | `deployments.rollback` runs | A new deployment attempt id is created, `triggerKind = rollback`, `sourceDeploymentId` points to the deployment being recovered from, `rollbackCandidateDeploymentId` points to the selected candidate, normal lifecycle events are emitted, and neither source nor candidate attempt is mutated. |
| DEP-ROLLBACK-002 | Requested candidate is missing or not visible | The supplied `rollbackCandidateDeploymentId` does not exist, belongs to another resource, is not successful, is expired/pruned, or is not visible to the actor | `deployments.rollback` runs | Command returns `deployment_rollback_candidate_not_found`, no new attempt is created, and no runtime execution starts. |
| DEP-ROLLBACK-003 | Requested candidate is not rollback-ready | Candidate exists but lacks runtime plan, environment snapshot, target/destination identity, artifact identity, or would require unsupported stateful data rollback | `deployments.rollback` runs | Command returns `deployment_not_rollback_ready` with safe readiness reason codes; no new attempt is created. |
| DEP-ROLLBACK-004 | Rollback rejects stale readiness marker | Client submits `readinessGeneratedAt` that predates durable source/candidate readiness state | `deployments.rollback` runs | Command returns `deployment_recovery_state_stale`, no new attempt is created, and caller must re-read `deployments.recovery-readiness`. |
| DEP-ROLLBACK-005 | Rollback coordinates resource runtime | Same resource/target/destination has active deployment work | `deployments.rollback` runs | Command waits or rejects according to resource-runtime coordination policy; it does not admit competing rollback work. |
| DEP-ROLLBACK-ENTRY-001 | Rollback entrypoints are explicit | Operation catalog, CLI, HTTP/oRPC, Web, and docs are inspected after Code Round | Rollback is active | Each surface dispatches `RollbackDeploymentCommand`, reuses application schemas, links to public docs/help anchors, and does not expose stateful data rollback. |

## Public Surfaces

- CLI:
  - `appaloft deployments rollback <deploymentId> --candidate <rollbackCandidateDeploymentId>`
  - Optional `--resource` and `--readiness-generated-at` for stale-readiness protection and
    operator/tool idempotence.
- HTTP/oRPC:
  - `POST /api/deployments/{deploymentId}/rollback`
  - Body includes `rollbackCandidateDeploymentId`, optional `resourceId`, and optional
    `readinessGeneratedAt`.
- Web:
  - Deployment detail recovery panel may enable rollback only when readiness says the selected
    candidate is ready and operation catalog marks `deployments.rollback` active.
  - Candidate cards must show safe deployment id, finish time, source/artifact summary, and blocked
    reasons from `deployments.recovery-readiness`.
- Public docs/help:
  - Reuse stable anchors on the deployment recovery page for rollback, rollback candidates,
    unsupported stateful data rollback, and readiness refresh.
- Future MCP/tools:
  - One rollback tool over the same application schema and readiness reason codes.

## Domain Ownership

- Bounded context: Release orchestration.
- Aggregate owner: `Deployment` owns rollback attempt state, immutable snapshot, runtime plan,
  recovery trigger metadata, source deployment link, rollback candidate link, lifecycle events, logs,
  and terminal result.
- Read-model owner: `deployments.recovery-readiness` ranks and explains rollback candidates. The
  rollback command re-evaluates the selected candidate server-side and does not trust client output.
- Runtime target owner: runtime adapters execute an accepted rollback attempt from retained artifact
  identity. They do not decide whether rollback is allowed.

## Command Semantics

- Load the source deployment being recovered from and the selected rollback candidate.
- Verify both deployments belong to the same resource and compatible project/environment/target/
  destination scope.
- Re-evaluate rollback readiness server-side from durable deployment, snapshot, artifact, retention,
  lifecycle, and resource-runtime state.
- Create a new deployment attempt from the candidate's retained runtime plan, environment snapshot,
  target/destination ids, dependency binding snapshot references, and retained runtime artifact
  identity.
- Set `triggerKind = rollback`, `sourceDeploymentId = deploymentId`, and
  `rollbackCandidateDeploymentId = rollbackCandidateDeploymentId`.
- Execute the new attempt through the normal deployment runtime execution and terminal persistence
  path.
- Never restore dependency-resource, volume, external system, queue, or secret values.

## Failure Semantics

- `validation_error`, phase `deployment-recovery-validation`
- `not_found`, phase `deployment-resolution` for source deployment lookup
- `deployment_rollback_candidate_not_found`, phase `recovery-admission`
- `deployment_not_rollback_ready`, phase `recovery-admission`
- `deployment_recovery_state_stale`, phase `recovery-admission`
- `coordination_timeout`, phase `operation-coordination`
- Existing runtime execution errors keep their owning code and phase after rollback reaches the
  accepted execution path.

All error details must be safe and include only deployment id, resource id, candidate id,
target/destination ids, readiness reason codes, command name, phase, and safe state markers.

## Non-Goals

- No stateful data rollback for databases, volumes, queues, dependency resources, or secrets.
- No automatic rollback scheduler.
- No event replay into an old deployment attempt.
- No source rebuild fallback when retained artifact identity is missing.
- No deployment-owned source/runtime/network/profile override fields.
- No separate paginated `deployments.rollback-candidates` query unless readiness output becomes too
  large for the first product use.

## Current Implementation Notes And Migration Gaps

- `deployments.recovery-readiness` returns rollback candidate readiness and exposes rollback as an
  active command when a retained candidate is ready.
- `Deployment` records `triggerKind`, `sourceDeploymentId`, and
  `rollbackCandidateDeploymentId` metadata for accepted rollback attempts.
- Current retained artifact identity is proven through the active recovery readiness and rollback
  command tests for the supported hermetic/runtime plan paths; future backend-specific artifact
  retention gaps should add explicit blocked readiness reasons rather than weakening rollback
  admission.
- Web recovery actions are wired to readiness output and dispatch rollback only when the selected
  candidate is allowed and active. Some broader backend compatibility and pagination rows remain
  deferred in the recovery test matrix.
