# Deployment Recovery Readiness

## Status

- Round: Spec Round
- Artifact state: source-of-truth semantics ready for Code Round planning; production code unchanged
- Roadmap target: Phase 7 Day-Two Production Controls (`0.9.0` beta target)
- Compatibility impact: `pre-1.0-policy`; new public query/commands and user-visible recovery
  guidance are planned but not yet active

## Business Outcome

Operators can inspect a failed, interrupted, canceled, or historical deployment and understand which
safe recovery actions are available before any write command runs.

The capability unifies recovery guidance across Web, CLI, HTTP/oRPC, and future MCP/tools by making
readiness a shared query contract rather than UI-local button logic.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Deployment attempt | One accepted execution of a deployment plan for a resource. | Release orchestration | Deployment |
| Recovery readiness | Read-only decision explaining whether retry, redeploy, or rollback is allowed and why. | Deployment read model / application policy | readiness query |
| Retry | New attempt from the failed attempt's immutable snapshot intent. | Deployment recovery command | retry deployment |
| Redeploy | New attempt from the current Resource profile. | Deployment recovery command | deploy current profile again |
| Rollback | New rollback attempt from a retained successful deployment candidate snapshot/artifact. | Deployment recovery command | restore previous version |
| Rollback candidate | Successful historical deployment with retained artifact/snapshot identity. | Deployment recovery read model | previous good deployment |
| Recovery reason | Typed user-safe reason that allows or blocks one recovery action. | Error/readiness output | blocker, recommendation |

## Recommended Public Operation Boundaries

This Spec Round accepts five public operation boundaries as candidates:

| Operation | Kind | Role | Code Round state |
| --- | --- | --- | --- |
| `deployments.recovery-readiness` | Query | Canonical shared readiness result for retry, redeploy, rollback, and candidates. | Add first or with first write command. |
| `deployments.retry` | Command | New attempt from the selected failed attempt's immutable snapshot. | Add after readiness query and command spec/test rows exist. |
| `deployments.redeploy` | Command | New attempt from current Resource profile and current environment/resource configuration. | Add after readiness query and resource-profile drift gates exist. |
| `deployments.rollback` | Command | New rollback attempt from a selected rollback candidate. | Add after artifact retention/candidate readiness is persisted. |
| `deployments.show` recovery summary | Query extension | Optional compact summary derived from `deployments.recovery-readiness`. | Allowed only when derived from same policy. |

`deployments.rollback-candidates` is not recommended as a separate first operation. Candidate listing
belongs in `deployments.recovery-readiness` because candidates are meaningful only with readiness
reasons, artifact retention state, and recommended actions. A future separate list query may be added
only if candidate pagination or large history makes it necessary.

## Semantics

### Retry

Retry creates a new deployment attempt id. It does not replay old events, mutate the old attempt, or
resume the old attempt id.

Retry uses the failed attempt's immutable snapshot intent:

- resolved source commit/image/artifact identity;
- runtime plan strategy and artifact intent;
- environment snapshot;
- network/access route snapshot;
- target and destination;
- deployment-time verification rules present on that attempt.

Retry is for transient or operator-correctable failures where the same attempted delivery can be
tried again, such as temporary network/provider failure, target capacity recovered after cleanup, or
runtime observation timeout.

Retry is blocked when:

- the attempt is non-terminal;
- failure details mark it non-retriable;
- the snapshot is incomplete;
- required source/artifact identity can no longer be materialized;
- the resource, environment, target, or destination lifecycle now blocks deployment admission;
- a same-resource active deployment owns the resource-runtime coordination scope.

### Redeploy

Redeploy creates a new deployment attempt id from the current Resource profile.

Redeploy re-reads the current resource-owned source/runtime/network/access/health/configuration
state and the current environment/effective configuration at command admission. Git branches or tags
may resolve to newer commits. Resource profile edits apply. Historical deployment snapshots are not
reused except for optional diagnostic comparison.

Redeploy is for "deploy what this resource says now." It is blocked when resource profile drift
requires explicit configuration commands first, when lifecycle/admission guards reject deployment, or
when runtime target backend capability is missing.

### Rollback

Rollback creates a new rollback deployment attempt id from a selected successful rollback candidate.

Rollback uses the candidate's immutable deployment snapshot and retained Docker/OCI artifact
identity. It must not re-plan from the current Resource profile and must not claim stateful data
rollback.

Rollback is blocked when:

- no successful retained candidate exists;
- the candidate snapshot or environment snapshot is incomplete;
- image/digest/local image/Compose identity is unavailable, pruned, or expired;
- target backend cannot apply the candidate artifact;
- current target, destination, route, or health policy cannot safely run the candidate;
- volumes, databases, or external dependencies would need restoration;
- the current resource-runtime scope is active and cannot be coordinated.

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| DRR-SPEC-001 | Failed transient attempt is retryable | A deployment failed with `retriable = true` and complete snapshot metadata | Operator reads recovery readiness | Result marks `retry.allowed = true`, returns no retry blockers, and recommends `deployments.retry` once active. |
| DRR-SPEC-002 | Failed invalid profile is not retryable | A deployment failed because the snapshot cannot produce a valid runtime plan | Operator reads recovery readiness | Result marks retry blocked with `deployment_not_retryable` reason and recommends fixing resource profile then redeploy. |
| DRR-SPEC-003 | Current profile redeploy is available | Resource is active, environment/target are deployable, and no active same-resource attempt exists | Operator reads recovery readiness | Result marks `redeploy.allowed = true` and describes that current Resource profile will be used. |
| DRR-SPEC-004 | Profile drift blocks redeploy | Existing-resource config deploy input differs from current Resource profile and unapplied drift is blocking | Operator reads recovery readiness | Result marks redeploy blocked and recommends explicit resource configuration commands. |
| DRR-SPEC-005 | Successful retained deployment is rollback-ready | A same-resource historical deployment succeeded and retained artifact/snapshot identity remains available | Operator reads recovery readiness | Result includes the candidate with `rollbackReady = true`. |
| DRR-SPEC-006 | Pruned artifact blocks rollback | A historical deployment succeeded but required image/Compose artifact identity is missing or expired | Operator reads recovery readiness | Result includes a blocked candidate reason `runtime-artifact-missing` or `rollback-candidate-expired` and recommends choosing another candidate or redeploying. |
| DRR-SPEC-007 | Stateful data rollback is out of scope | Candidate includes dependency or volume state that would require data restoration | Operator reads recovery readiness | Result marks rollback blocked or warns that only workload runtime will roll back; it never claims database/volume rollback. |
| DRR-SPEC-008 | Event stream gap does not decide readiness | `deployments.stream-events` reports a cursor gap but durable deployment detail and artifact state are available | Operator reads recovery readiness | Readiness is computed from durable state, not from the client stream gap. |
| DRR-SPEC-009 | Web recovery panel is read-only before Code Round | Deployment detail has readiness data but write commands are not active | Web renders deployment detail | Web shows status, reasons, and links only; no retry/redeploy/rollback dispatch occurs. |
| DRR-SPEC-010 | Future MCP output is typed | Future tool asks whether a deployment can recover | Tool receives readiness result | Tool sees booleans and typed reasons, not only localized prose. |

## Output Contract

The target readiness result shape is:

```ts
type DeploymentRecoveryReadiness = {
  schemaVersion: "deployments.recovery-readiness/v1";
  deploymentId?: string;
  resourceId: string;
  generatedAt: string;
  stateVersion?: string;
  recoverable: boolean;
  retryable: boolean;
  redeployable: boolean;
  rollbackReady: boolean;
  retry: RecoveryActionReadiness;
  redeploy: RecoveryActionReadiness;
  rollback: {
    allowed: boolean;
    reasons: RecoveryReadinessReason[];
    candidates: RollbackCandidateReadiness[];
    recommendedCandidateId?: string;
  };
  recommendedActions: RecoveryRecommendedAction[];
};

type RecoveryActionReadiness = {
  allowed: boolean;
  reasons: RecoveryReadinessReason[];
  targetOperation: "deployments.retry" | "deployments.redeploy" | "deployments.rollback";
};

type RollbackCandidateReadiness = {
  deploymentId: string;
  finishedAt: string;
  status: "succeeded";
  sourceSummary?: string;
  artifactSummary?: string;
  environmentSnapshotId?: string;
  runtimeTargetSummary?: string;
  rollbackReady: boolean;
  reasons: RecoveryReadinessReason[];
};

type RecoveryReadinessReason = {
  code: string;
  category: "allowed" | "blocked" | "warning" | "info";
  phase: string;
  relatedDeploymentId?: string;
  relatedEntityId?: string;
  relatedEntityType?: string;
  retriable: boolean;
  recommendation?: string;
};
```

Secret values, raw environment values, registry credentials, raw provider output, and unbounded logs
must not appear in readiness output.

## Public Surfaces

- Web: deployment detail recovery panel, derived from readiness, with action buttons hidden until
  write commands are active.
- CLI: `appaloft deployments recovery-readiness <deploymentId>` target query; failed deploy output
  may suggest show/events/readiness before suggesting writes.
- HTTP/oRPC: `GET /api/deployments/{deploymentId}/recovery-readiness` target route or equivalent
  oRPC procedure over the shared query schema.
- Future MCP/tool: read-only recovery inspection tool plus future write tools mapped to the same
  operation keys.
- Public docs/help: Docs Round target should be a Deploy or Observe/Troubleshoot page with stable
  anchors for retry, redeploy, rollback, and rollback candidates.

## Domain Ownership

- Bounded context: Release orchestration.
- Aggregate/resource owner: `Deployment` owns attempt history and immutable snapshots; `Resource`
  owns current profile used by redeploy.
- Upstream/downstream contexts: Workload Delivery supplies current Resource profile and health
  observations; Runtime Topology supplies target/destination/proxy/access readiness; Configuration
  supplies immutable environment snapshots and current effective configuration.

## Non-Goals

- Do not implement code in this Spec Round.
- Do not add active operation catalog entries in this round.
- Do not reintroduce public cancel.
- Do not restore databases, volumes, external dependencies, secrets, or provider state.
- Do not infer recovery readiness solely from client event-stream continuity.
- Do not add deployment-owned source/runtime/network/profile fields.

## Current Implementation Notes And Migration Gaps

- Low-level rollback helpers and rollback model objects may exist but remain internal under ADR-016.
- Runtime artifact retention and previous runtime identity are not complete enough for active
  rollback.
- `deployments.stream-events` is active, but remaining gap/cancellation tests are observation
  hardening, not recovery blockers.
- Public docs/help anchors for deployment recovery are not complete; Docs Round remains required
  before user-facing Code Round completion.

## Open Questions

- What initial artifact retention duration should be guaranteed before public prune exists?
- Should default rollback candidate ranking prefer latest success or latest success with matching
  current target/destination/access policy?
