# resources.health Query Spec

## Metadata

- Operation key: `resources.health`
- Query class: `ResourceHealthQuery`
- Input schema: `ResourceHealthQueryInput`
- Handler: `ResourceHealthQueryHandler`
- Query service: `ResourceHealthQueryService`
- Domain / bounded context: Workload Delivery / Resource observation
- Current status: active query, implemented cached/read-model aggregation
- Source classification: implemented contract with live-probe gaps

## Normative Contract

`resources.health` returns the current health and availability summary for one resource.

It is a read-only resource observation query. It must not create deployments, restart runtime
processes or containers, apply proxy configuration, mutate health policy, edit domain bindings, or
reinterpret a historical deployment result.

The query exists because a deployment attempt can be terminal `succeeded` while the current resource
is not reachable, is still starting, has no configured health check, has a failing container health
check, or has a broken public route.

## Global References

This query inherits:

- [ADR-020: Resource Health Observation](../decisions/ADR-020-resource-health-observation.md)
- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-013: Project Resource Navigation And Deployment Ownership](../decisions/ADR-013-project-resource-navigation-and-deployment-ownership.md)
- [ADR-015: Resource Network Profile](../decisions/ADR-015-resource-network-profile.md)
- [ADR-017: Default Access Domain And Proxy Routing](../decisions/ADR-017-default-access-domain-and-proxy-routing.md)
- [ADR-019: Edge Proxy Provider And Observable Configuration](../decisions/ADR-019-edge-proxy-provider-and-observable-configuration.md)
- [Resource Health Observation Workflow](../workflows/resource-health-observation.md)
- [Resource Health Error Spec](../errors/resources.health.md)
- [Resource Health Test Matrix](../testing/resource-health-test-matrix.md)
- [Resource Health Implementation Plan](../implementation/resource-health-plan.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Input Model

```ts
type ResourceHealthQueryInput = {
  resourceId: string;
  mode?: "cached" | "live";
  includeChecks?: boolean;
  includePublicAccessProbe?: boolean;
  includeRuntimeProbe?: boolean;
};
```

| Field | Required | Meaning |
| --- | --- | --- |
| `resourceId` | Yes | Resource whose current health is requested. |
| `mode` | No | Defaults to `cached`. `cached` reads the latest observed summary. `live` may perform bounded read-only inspection when the adapter supports it. |
| `includeChecks` | No | Includes individual check records when true. Defaults to true for resource detail and false for compact navigation. |
| `includePublicAccessProbe` | No | Allows a bounded public route probe when `mode = live`. |
| `includeRuntimeProbe` | No | Allows runtime/container/process inspection when `mode = live`. |

The query input must not accept deployment command fields, source locators, raw container ids,
provider-native route ids, shell commands, host paths, tokens, credentials, or mutable policy
fields.

## Output Model

```ts
type ResourceHealthResult = Result<ResourceHealthSummary, DomainError>;

type ResourceHealthSummary = {
  schemaVersion: "resources.health/v1";
  resourceId: string;
  generatedAt: string;
  observedAt?: string;
  overall: ResourceHealthOverall;
  latestDeployment?: ResourceHealthDeploymentContext;
  runtime: ResourceRuntimeHealthSection;
  healthPolicy: ResourceHealthPolicySection;
  publicAccess: ResourcePublicAccessHealthSection;
  proxy: ResourceProxyHealthSection;
  checks: ResourceHealthCheck[];
  sourceErrors: ResourceHealthSourceError[];
};
```

Overall status:

```ts
type ResourceHealthOverall =
  | "healthy"
  | "degraded"
  | "unhealthy"
  | "starting"
  | "stopped"
  | "not-deployed"
  | "unknown";
```

Runtime lifecycle:

```ts
type ResourceRuntimeLifecycle =
  | "not-deployed"
  | "starting"
  | "running"
  | "restarting"
  | "degraded"
  | "stopped"
  | "exited"
  | "unknown";
```

Runtime health:

```ts
type ResourceRuntimeHealth = "healthy" | "unhealthy" | "unknown" | "not-configured";
```

Check records:

```ts
type ResourceHealthCheck = {
  name: string;
  target: "runtime" | "container" | "command" | "public-access" | "proxy-route";
  status: "passed" | "failed" | "skipped" | "unknown";
  observedAt: string;
  durationMs?: number;
  statusCode?: number;
  exitCode?: number;
  message?: string;
  reasonCode?: string;
  phase?: string;
  retriable?: boolean;
  metadata?: Record<string, string>;
};
```

Required top-level behavior:

- `overall` is the user-facing resource status, not latest deployment status.
- `latestDeployment` may include id, status, finished time, and last structured error as context.
- `runtime` reports current runtime lifecycle and health, including container/process health when
  available.
- `healthPolicy` reports whether a health check is enabled, missing, or unsupported.
- `publicAccess` reports the current resource URL being checked. Durable resource domain bindings
  take precedence over generated default access.
- `proxy` reports route readiness and provider key when the resource uses reverse-proxy exposure.
- `sourceErrors` records per-source observation failures without failing the whole query when the
  resource can still be identified.

## Status Resolution

The query must resolve overall status using these rules:

| Condition | Overall |
| --- | --- |
| No latest runtime/deployment instance exists | `not-deployed` |
| Runtime lifecycle is starting or restarting | `starting` |
| Runtime lifecycle is exited/stopped and no replacement is running | `stopped` |
| Runtime lifecycle is degraded or a required health check failed | `unhealthy` |
| Some checks pass but public access or proxy route fails | `degraded` |
| Runtime is running and health/public access/proxy checks required by policy pass | `healthy` |
| Runtime is running but health policy is missing or unsupported | `unknown` |
| Observation source is unavailable but no failing fact is known | `unknown` |

`deployment.status = "succeeded"` is not a status-resolution override.

## Health Policy Semantics

HTTP health policy:

- runs against the resource internal endpoint by default;
- uses `ResourceNetworkProfile.internalPort` when the policy port is omitted;
- defaults host to `localhost`, scheme to `http`, path to `runtimeProfile.healthCheckPath` or `/`,
  method to `GET`, and expected status code to `200`;
- may check bounded response text when configured;
- treats timeout, DNS/connect failure, non-expected status, and response mismatch as failed checks.

Command health policy:

- runs inside the current workload runtime boundary when supported;
- succeeds only when the command exits with code 0;
- rejects multiline commands and shell metacharacters unless a later ADR introduces a sandbox model;
- is skipped with a structured reason when the adapter cannot run commands inside the resource.

Missing policy:

- a running container/process with no health policy is `unknown`, not `healthy`;
- the UI may explain that the resource can still be reachable, but health has not been proven.

## Public Access Semantics

Public access checks target the resource's current route:

1. ready durable domain binding for the resource/destination/target/path;
2. latest durable domain route in `ResourceAccessSummary`;
3. latest generated default route;
4. planned generated route only when no deployment has realized a route yet.

The query must not treat deployment-scoped route snapshots as domain ownership. A deployment
snapshot records which route was used by that attempt; the current route belongs to resource access
summary and domain binding state.

## Error Contract

Whole-query failures are limited to invalid input, missing resource, permission failures, and
inability to build a safe response. Runtime/proxy/access observation failures should usually appear
as section statuses and `sourceErrors` inside an `ok` result.

All errors use [Resource Health Error Spec](../errors/resources.health.md).

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| Web | Resource detail shows current resource health and sidebar/list compact status uses this query/projection when available. | Implemented |
| Desktop | Same Web surface. | Implemented through Web shell |
| CLI | `appaloft resource health <resourceId> [--live] [--json]` prints summary and checks. | Implemented |
| oRPC / HTTP | `GET /api/resources/{resourceId}/health` using the query schema. | Implemented |
| Automation / MCP | Future query/tool over the same operation key. | Future |

## Current Implementation Notes And Migration Gaps

`resources.health` is implemented as an application query slice and exposed through operation
catalog, oRPC/HTTP, CLI, contracts, and Web resource surfaces.

The current implementation is a cached/read-model aggregation slice. It resolves resource context,
latest deployment context, runtime lifecycle from latest deployment state, configured
`runtimePlan.execution.healthCheckPath`, resource access summary, and proxy route status. It does
not mark a successful deployment as healthy without a configured/current health observation.

Live runtime inspection, Docker health-state inspection, command health checks, bounded HTTP
internal probes, durable-domain readiness composition from domain binding records, and public URL
probes are still future work. When callers request `mode = "live"` or explicit probe flags, the
query returns a safe cached summary with source errors stating that live probes are not available in
this implementation slice.

Runtime deployment verification still checks local loopback or Docker container reachability during
`deployments.create` execution and records deployment success/failure. That remains
attempt-scoped and is not the long-lived resource health model.

The Web resource header, resource detail health panel, sidebar, project list, and project resource
list now use `ResourceHealthSummary.overall` rather than `lastDeploymentStatus`.

## Open Questions

- Should `mode = live` be exposed in the first public query or kept internal until background
  observation state exists?
- Should resource list and sidebar use `resources.health` per resource or a future compact
  `resources.summary`/navigation projection?
