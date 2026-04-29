# deployments.show Query Spec

## Metadata

- Operation key: `deployments.show`
- Query class: `ShowDeploymentQuery`
- Input schema: `ShowDeploymentQueryInput`
- Handler: `ShowDeploymentQueryHandler`
- Query service: `ShowDeploymentQueryService`
- Domain / bounded context: Release orchestration / Deployment detail read model
- Current status: active query, implemented
- Source classification: normative contract

## Normative Contract

`deployments.show` is the source-of-truth query for one deployment-attempt detail surface.

It is read-only. It must not:

- create, retry, redeploy, cancel, clean up, or roll back deployments;
- mutate resources, source links, routes, domains, certificates, or server state;
- replace `resources.health` as the source of current resource health;
- replace `deployments.logs` as the full attempt-log query;
- turn the create-time progress stream into a hidden business command.

```ts
type ShowDeploymentResult = Result<DeploymentDetail, DomainError>;
```

The query contract is:

- validation failure returns `err(DomainError)`;
- missing or invisible deployment returns `err(DomainError)`;
- success returns `ok(DeploymentDetail)`;
- optional related sections may be `unavailable`, `stale`, or `not-requested` inside `ok`;
- current resource health, runtime logs, and diagnostic copy remain companion queries, not fields
  that may silently mutate or probe through this query.

## Global References

This query inherits:

- [ADR-013: Project Resource Navigation And Deployment Ownership](../decisions/ADR-013-project-resource-navigation-and-deployment-ownership.md)
- [ADR-014: Deployment Admission Uses Resource Profile](../decisions/ADR-014-deployment-admission-uses-resource-profile.md)
- [ADR-016: Deployment Command Surface Reset](../decisions/ADR-016-deployment-command-surface-reset.md)
- [ADR-017: Default Access Domain And Proxy Routing](../decisions/ADR-017-default-access-domain-and-proxy-routing.md)
- [ADR-021: Docker/OCI Workload Substrate](../decisions/ADR-021-docker-oci-workload-substrate.md)
- [ADR-023: Runtime Orchestration Target Boundary](../decisions/ADR-023-runtime-orchestration-target-boundary.md)
- [ADR-034: Deployment Recovery Readiness](../decisions/ADR-034-deployment-recovery-readiness.md)
- [deployments.create Command Spec](../commands/deployments.create.md)
- [Deployment Detail And Observation Workflow Spec](../workflows/deployment-detail-and-observation.md)
- [Deployment Detail Error Spec](../errors/deployments.show.md)
- [Deployment Detail Test Matrix](../testing/deployments.show-test-matrix.md)
- [Deployment Detail Implementation Plan](../implementation/deployments.show-plan.md)
- [Deployment Recovery Readiness Spec](../specs/012-deployment-recovery-readiness/spec.md)
- [resources.diagnostic-summary Query Spec](./resources.diagnostic-summary.md)
- [resources.health Query Spec](./resources.health.md)
- [resources.runtime-logs Query Spec](./resources.runtime-logs.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Purpose

Let Web, CLI, HTTP/oRPC, and future MCP/tool clients inspect one accepted deployment attempt as:

- immutable attempt context;
- current derived lifecycle state;
- immutable runtime/access snapshot context for that attempt;
- structured current failure/progress summary when available;
- related project/environment/resource/server/destination context safe for navigation.

The query exists so deployment detail stops depending on `deployments.list` as a surrogate detail
contract.

## Input Model

```ts
type ShowDeploymentQueryInput = {
  deploymentId: string;
  includeTimeline?: boolean;
  includeSnapshot?: boolean;
  includeRelatedContext?: boolean;
  includeLatestFailure?: boolean;
  includeRecoverySummary?: boolean;
};
```

| Field | Requirement | Meaning |
| --- | --- | --- |
| `deploymentId` | Required | Deployment attempt whose detail is requested. |
| `includeTimeline` | Optional | Includes normalized progress/timeline summary when read models can provide it. Defaults to `true` for detail pages. |
| `includeSnapshot` | Optional | Includes immutable runtime/access/deployment snapshot detail. Defaults to `true` for detail pages. |
| `includeRelatedContext` | Optional | Includes resource/project/environment/server/destination navigation context. Defaults to `true`. |
| `includeLatestFailure` | Optional | Includes the latest structured failure/progress summary when available. Defaults to `true`. |
| `includeRecoverySummary` | Optional | Includes a compact recovery summary only when it is derived from the shared `deployments.recovery-readiness` policy. Defaults to `false` until the readiness query is active. |

The query input must not accept:

- mutable deployment admission fields;
- resource source/runtime/network profile fields;
- log tail/follow options;
- runtime probe flags;
- provider-native ids, container ids, file paths, or shell commands.

## Output Model

```ts
type DeploymentDetail = {
  schemaVersion: "deployments.show/v1";
  deployment: DeploymentAttemptIdentity;
  status: DeploymentAttemptStatusSummary;
  relatedContext?: DeploymentRelatedContext;
  snapshot?: DeploymentAttemptSnapshot;
  timeline?: DeploymentAttemptTimeline;
  latestFailure?: DeploymentAttemptFailureSummary;
  recoverySummary?: DeploymentAttemptRecoverySummary;
  nextActions: DeploymentAttemptNextAction[];
  generatedAt: string;
};

type DeploymentAttemptRecoverySummary = {
  source: "deployments.recovery-readiness";
  retryable: boolean;
  redeployable: boolean;
  rollbackReady: boolean;
  rollbackCandidateCount: number;
  blockedReasonCodes: string[];
};
```

Required behavior:

- `deployment` includes deployment id, resource/project/environment/server/destination ids,
  trigger/source metadata safe for display, preview linkage when present, created/started/finished
  timestamps when known, and current terminal/non-terminal status.
- `status` is deployment-owned attempt state. It must not be relabeled as current resource health.
- `relatedContext` includes navigation-safe summaries for the owning resource, project,
  environment, target/server, and destination when the read model can resolve them.
- `snapshot` contains immutable attempt context such as runtime strategy, runtime target backend,
  access route snapshot, source commit/ref/image identity, requested runtime name, and placement
  metadata. It must describe what this attempt used, not what the resource currently uses.
- `timeline` contains normalized attempt events/progress summaries already available from persisted
  state or safely derived read models. It is not a live stream.
- `latestFailure` contains the latest structured error/progress failure summary when one exists.
- `recoverySummary`, when present, is a compact read-only projection of the shared recovery readiness
  policy. It may show retry/redeploy/rollback readiness and candidate counts, but it must not expose
  active write actions unless the corresponding operations are active in the operation catalog.
- `nextActions` may include read-only deep links or companion query affordances such as
  `logs`, `resource-detail`, `resource-health`, or `diagnostic-summary`. It must not invent
  retry/redeploy/rollback commands before those commands are public again.

## Ownership Rules

`deployments.show` owns deployment-attempt detail only.

It must not:

- present generated or durable access as the current resource route when the resource currently has
  a different selected route;
- treat deployment success as proof of current resource health;
- expose current resource configuration as if the deployment snapshot were mutable profile state.

Current resource health remains `resources.health`.
Current public access summary remains resource-scoped through `ResourceAccessSummary` and
resource/detail queries.
Detailed attempt logs remain `deployments.logs`.

## Section Semantics

When related context or derived observation is unavailable but the deployment record can still be
safely loaded, the query should return `ok(...)` with section status markers instead of failing the
whole query.

Examples:

- missing related resource read model after the deployment row loads;
- missing server summary for a deleted/deactivated target;
- no persisted timeline projection yet;
- deployment finished failed but the runtime adapter did not emit rich progress detail.

Whole-query failures are reserved for invalid input, missing deployment, permission failures, or
inability to build a safe base detail response.

## Handler Boundary

The query handler must delegate to the query service and return the typed `Result`.

It must not:

- call repositories or adapters directly from transports;
- open deployment log streams;
- inspect runtime or proxy state by issuing live probes;
- infer or mutate resource lifecycle state;
- start new deployments or retries.

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| Web | Deployment detail page reads this query for overview/timeline/snapshot sections. | Implemented |
| CLI | `appaloft deployments show <deploymentId> [--json]` over the same query schema. | Implemented |
| oRPC / HTTP | `GET /api/deployments/{deploymentId}` using the query schema. | Implemented |
| Automation / MCP | Future read-only tool/query over the same operation key. | Future |

## Current Implementation Notes And Migration Gaps

`deployments.show` is active in the operation catalog, CLI, HTTP/oRPC, and Web deployment detail
path.

Timeline/watch behavior remains intentionally separate from this query and is governed by accepted
candidate `deployments.stream-events`. `deployments.logs` remains the separate attempt-log
operation.

Deployment recovery readiness is now accepted under ADR-034, but not active. Until
`deployments.recovery-readiness` is implemented, `deployments.show` must keep recovery actions out of
`nextActions` and may only point users to read-only logs, event timeline, resource health, and
diagnostic summary. After readiness is active, any compact recovery summary in this query must be
derived from the same readiness policy and not recomputed independently by the detail query.

## Open Questions

- Should `deployments.show` keep only a recent summary once `deployments.stream-events` becomes
  active, or should it continue exposing a bounded recent timeline section for overview screens?
