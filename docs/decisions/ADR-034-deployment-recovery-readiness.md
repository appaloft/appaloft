# ADR-034: Deployment Recovery Readiness

Status: Accepted

Date: 2026-04-29

## Context

`deployments.show` and `deployments.stream-events` are now first-class observation surfaces, but
ADR-016 still keeps retry, redeploy, and rollback out of the public write surface until their
command boundaries, readiness rules, events, errors, tests, and implementation plans are rebuilt.

Operators need one consistent way to answer:

- whether a failed, interrupted, canceled, or superseded deployment can be retried;
- whether a resource can be redeployed from its current profile;
- whether a previous deployment is a rollback candidate;
- why recovery is blocked and which safe next action is recommended.

Without a shared readiness contract, Web, CLI, HTTP/oRPC, and future MCP tools would each invent
different recovery labels and would risk exposing unsafe rollback or retry actions from observation
screens.

## Decision

Appaloft defines deployment recovery as one read-side readiness contract plus three future write
commands:

| Operation | Kind | Public state after this ADR | Meaning |
| --- | --- | --- | --- |
| `deployments.recovery-readiness` | Query | Accepted candidate | Reads retry, redeploy, rollback readiness and candidate reasons for one deployment/resource context. |
| `deployments.retry` | Command | Accepted candidate | Creates a new deployment attempt from the failed attempt's immutable snapshot intent. |
| `deployments.redeploy` | Command | Accepted candidate | Creates a new deployment attempt from the current Resource profile. |
| `deployments.rollback` | Command | Accepted candidate | Creates a new rollback deployment attempt from a selected successful rollback candidate snapshot/artifact. |

These operations are not active until a Code Round adds `CORE_OPERATIONS.md`,
`operation-catalog.ts`, command/query slices, entrypoints, and executable tests in the same change.

`deployments.show` may include a compact recovery summary only after it is derived from the same
readiness policy used by `deployments.recovery-readiness`. It must not independently decide whether
retry, redeploy, or rollback is allowed.

## Recovery Semantics

### Retry

Retry is not a replay of old fact events and does not mutate the old deployment attempt.

`deployments.retry` creates a new deployment attempt id and links it to the source failed attempt.
It reuses the failed attempt's immutable deployment snapshot intent where possible, including the
resolved source commit/image/artifact intent, runtime strategy, environment snapshot, network/access
snapshot, target, and destination. It is for transient failure recovery where the operator wants to
try the same attempted delivery again.

Retry is allowed only from terminal failed, interrupted, canceled, or superseded attempts that carry
enough snapshot and failure metadata to prove a same-intent retry. Non-terminal attempts are not
retryable. Attempts whose failure is non-retriable, whose snapshot is incomplete, or whose target
artifact can no longer be materialized are not retryable.

### Redeploy

Redeploy is a new deployment attempt from the current Resource profile.

`deployments.redeploy` consumes the current `ResourceSourceBinding`, `ResourceRuntimeProfile`,
`ResourceNetworkProfile`, access profile, effective configuration, environment state, target, and
destination at the time the command is admitted. It may resolve a newer Git commit or updated
resource profile. It is for applying current desired state, not for repeating an old failure exactly.

Redeploy is blocked when the resource, environment, target, or destination lifecycle rejects new
deployment admission, when profile drift must be resolved first, or when a same-resource deployment
is still active according to the shared mutation coordination and supersede rules.

### Rollback

Rollback creates a new rollback deployment attempt from a retained successful deployment candidate.

`deployments.rollback` does not restore databases, volumes, external dependencies, or secrets to a
previous value. It reuses a previous successful deployment snapshot and retained Docker/OCI runtime
artifact identity to replace the current runtime with the selected candidate. The rollback attempt
gets its own deployment id, status progression, events, logs, and failure details.

Rollback must not re-plan from the current Resource profile. It uses the candidate's immutable
snapshot/artifact identity. If the retained artifact is missing, unsafe, stateful-only, incompatible
with the current target backend, or cannot satisfy required route/health gates, the candidate is not
rollback-ready.

## Rollback Candidates And Readiness

A deployment is a rollback candidate when all of these are true:

- it belongs to the same resource and compatible project/environment/target/destination scope;
- it reached terminal success;
- it has an immutable runtime plan snapshot and environment snapshot;
- it has retained runtime artifact identity, such as image tag/digest/local image id or Compose
  project/service artifact identity;
- it is not archived, pruned, deleted, or expired by retention policy;
- it does not depend on unsupported stateful data rollback;
- the selected runtime target backend reports or can infer that the artifact can still be applied.

Readiness is denied with structured reasons when:

- there is no successful retained candidate;
- artifact or source snapshot metadata is incomplete;
- image, digest, local image, Compose project, or source workspace retention is missing or expired;
- target, destination, proxy route, or runtime backend capability no longer matches;
- resource, environment, project, or target lifecycle blocks deployment admission;
- current active deployment coordination blocks recovery;
- required health, route, or public verification cannot be satisfied;
- rollback would imply data/volume/dependency restoration that Appaloft does not perform.

Readiness output must include a user-safe reason code, a short operator-facing summary, and a
recommended next action such as inspect logs, open diagnostic summary, redeploy current profile,
choose another candidate, free target capacity, or wait for the active deployment to finish.

## User-Visible Contract

Web deployment detail may show a recovery panel with:

- retryable/redeployable/rollback-ready badges derived from readiness output;
- blocked reasons grouped by recovery action;
- rollback candidate list with candidate deployment id, finished time, source/artifact summary, and
  retention status;
- links to event timeline, logs, resource health, and diagnostic summary;
- action buttons only after the corresponding command is active in the operation catalog.

CLI failure output should suggest the safest available read-only inspection first:

```text
Deployment failed.
Run: appaloft deployments show <deploymentId>
Run: appaloft deployments recovery-readiness <deploymentId>
```

After Code Round activates write commands, CLI may suggest concrete retry/redeploy/rollback commands
only when readiness says that action is allowed.

HTTP/oRPC and future MCP/tool contracts must use the same readiness schema. Future MCP tools should
express `recoverable`, `retryable`, `redeployable`, and `rollbackReady` as booleans plus typed
reasons, not as free-text advice.

## Events

Recovery commands create new deployment attempts and reuse the existing deployment lifecycle event
chain:

```text
deployment-requested
  -> build-requested, when required
  -> deployment-started
  -> deployment-succeeded | deployment-failed
```

The new attempt must carry recovery intent metadata:

- `triggerKind`: `create`, `retry`, `redeploy`, or `rollback`;
- `sourceDeploymentId` for retry and rollback;
- `rollbackCandidateDeploymentId` for rollback;
- `recoveryReason` when supplied by the operator.

This ADR does not require new public lifecycle event names before Code Round. If implementation
finds the existing event payload cannot safely distinguish recovery intent, a follow-up Spec Round
must add event specs such as `deployment-retry-requested` or `deployment-rollback-requested` before
publishing them.

`deployments.stream-events` reconnect or gap behavior does not change recovery eligibility. Stream
gaps mean observation continuity is incomplete; recovery readiness must read durable deployment,
snapshot, artifact, and retention state instead of inferring from a client stream.

## Errors

Recovery admission failures use structured errors:

| Error code | Category | Phase | Retriable | Meaning |
| --- | --- | --- | --- | --- |
| `deployment_not_retryable` | `application` or `conflict` | `recovery-admission` | No | The selected attempt cannot be retried. |
| `deployment_not_redeployable` | `application` or `conflict` | `recovery-admission` | No | Current Resource profile cannot admit a redeploy. |
| `deployment_not_rollback_ready` | `application` or `conflict` | `recovery-admission` | No | The selected candidate cannot be rolled back safely. |
| `deployment_rollback_candidate_not_found` | `not-found` | `recovery-admission` | No | The requested rollback candidate is missing, expired, or not visible. |
| `deployment_recovery_state_stale` | `conflict` | `recovery-admission` | No | The submitted readiness marker no longer matches durable deployment state. |
| `coordination_timeout` | `timeout` | `operation-coordination` | Yes | Recovery command could not acquire the logical resource-runtime scope before admission. |

Error details must include safe deployment/resource/target ids, readiness reason codes, candidate
ids when relevant, `commandName` or `queryName`, `phase`, and remediation hints. They must not
include secrets, raw environment values, private registry credentials, or unbounded runtime output.

## Consequences

- ADR-016 remains valid: no recovery write operation is public until this ADR's specs, test matrix,
  implementation plan, operation catalog, and entrypoint contracts are implemented together.
- Recovery readiness becomes the single source of truth for Web, CLI, HTTP/oRPC, and future MCP
  prompts.
- `deployments.show` and `deployments.stream-events` stay read-only observation boundaries.
- Runtime target backends must retain or report artifact/snapshot identity enough to support
  candidate readiness, but retention/prune policy remains an implementation-plan and future
  operator-prune concern.
- Stateful data rollback is explicitly out of scope until a separate dependency-resource or
  backup/restore ADR accepts it.

## Governed Specs

- [Deployment Recovery Readiness Spec](../specs/012-deployment-recovery-readiness/spec.md)
- [Business Operation Map](../BUSINESS_OPERATION_MAP.md)
- [Core Operations](../CORE_OPERATIONS.md)
- [deployments.recovery-readiness Query Spec](../queries/deployments.recovery-readiness.md)
- [deployments.retry Command Spec](../commands/deployments.retry.md)
- [deployments.redeploy Command Spec](../commands/deployments.redeploy.md)
- [deployments.rollback Command Spec](../commands/deployments.rollback.md)
- [deployments.show Query Spec](../queries/deployments.show.md)
- [deployments.stream-events Query Spec](../queries/deployments.stream-events.md)
- [Deployment Recovery Readiness Error Spec](../errors/deployment-recovery-readiness.md)
- [Deployment Recovery Readiness Test Matrix](../testing/deployment-recovery-readiness-test-matrix.md)
- [Deployment Recovery Readiness Implementation Plan](../implementation/deployment-recovery-readiness-plan.md)
- [Deployment Detail And Observation Workflow Spec](../workflows/deployment-detail-and-observation.md)
- [deployments.create Command Spec](../commands/deployments.create.md)
- [deployments.create Error Spec](../errors/deployments.create.md)
- [deployments.create Test Matrix](../testing/deployments.create-test-matrix.md)
- [Deployment Event Stream Test Matrix](../testing/deployments.stream-events-test-matrix.md)
- [Deployment Runtime Substrate Implementation Plan](../implementation/deployment-runtime-substrate-plan.md)
- [ADR-016: Deployment Command Surface Reset](./ADR-016-deployment-command-surface-reset.md)
- [ADR-021: Docker/OCI Workload Substrate](./ADR-021-docker-oci-workload-substrate.md)
- [ADR-029: Deployment Event Stream And Recovery Boundary](./ADR-029-deployment-event-stream-and-recovery-boundary.md)

## Migration Gaps

Current code may retain low-level rollback helpers, runtime artifact fields, or historical rollback
model objects, but they are internal only. Public recovery readiness, retry, redeploy, and rollback
entrypoints remain absent until a Code Round implements the accepted candidate operations and updates
the operation catalog.

Current event-stream cursor gaps are observation gaps. They must not be used as recovery blockers
unless the durable event/progress source itself is also the only available snapshot/artifact evidence.

## Open Questions

- What is the first explicit artifact retention duration before runtime prune becomes public?
- Should rollback candidate ranking prefer most recent successful deployment, latest matching
  environment snapshot, or operator-selected pinned candidate when multiple candidates are ready?
