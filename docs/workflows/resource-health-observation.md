# Resource Health Observation Workflow Spec

## Normative Contract

Resource health observation answers whether a resource is currently usable, not whether the latest
deployment attempt ended successfully.

The workflow is resource-owned:

```text
Resource profile + latest runtime instance
  -> runtime/container/process inspection
  -> configured health policy evaluation
  -> proxy route/public access observation
  -> ResourceHealthSummary projection/query
  -> resource detail, project list, sidebar, CLI/API display
```

It is not a deployment write operation. It must not add health fields back to `deployments.create`.
Existing resources configure policy through `resources.configure-health`; the observation workflow
then reads that policy without mutating it.

## Global References

This workflow inherits:

- [ADR-020: Resource Health Observation](../decisions/ADR-020-resource-health-observation.md)
- [resources.health Query Spec](../queries/resources.health.md)
- [Resource Health Error Spec](../errors/resources.health.md)
- [Resource Health Test Matrix](../testing/resource-health-test-matrix.md)
- [Resource Health Implementation Plan](../implementation/resource-health-plan.md)
- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-013: Project Resource Navigation And Deployment Ownership](../decisions/ADR-013-project-resource-navigation-and-deployment-ownership.md)
- [ADR-015: Resource Network Profile](../decisions/ADR-015-resource-network-profile.md)
- [ADR-017: Default Access Domain And Proxy Routing](../decisions/ADR-017-default-access-domain-and-proxy-routing.md)
- [ADR-019: Edge Proxy Provider And Observable Configuration](../decisions/ADR-019-edge-proxy-provider-and-observable-configuration.md)
- [Project Resource Console Workflow](./project-resource-console.md)
- [Default Access Domain And Proxy Routing](./default-access-domain-and-proxy-routing.md)
- [Resource Runtime Log Observation](./resource-runtime-log-observation.md)
- [Resource Diagnostic Summary](./resource-diagnostic-summary.md)
- [Resource Access Failure Diagnostics](./resource-access-failure-diagnostics.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Workflow Position

Resource health observation consumes existing state:

- `ResourceSourceBinding`;
- `ResourceRuntimeProfile`;
- `ResourceNetworkProfile`;
- latest relevant deployment snapshot;
- runtime adapter/provider inspection data;
- `ResourceAccessSummary`;
- domain binding readiness;
- edge proxy readiness and route realization state.

It produces a read model/query response:

```text
ResourceHealthSummary
```

The workflow does not create or mutate resources, deployments, domain bindings, proxy
configuration, or health policy.

## Health Signal Sources

| Source | Meaning | Required for first implementation |
| --- | --- | --- |
| Latest deployment context | Which runtime plan and deployment id produced the current workload instance. | Yes |
| Runtime lifecycle | Whether the current process/container/task is running, starting, restarting, exited, stopped, or unknown. | Yes |
| Container/process health | Provider-native health state such as Docker `healthy`, `unhealthy`, `starting`, or no health check. | Yes for Docker/local adapters |
| Configured HTTP policy | Bounded HTTP probe details and expected result. | Yes for HTTP resources |
| Configured command policy | Bounded command result inside workload runtime. | Future or adapter-dependent |
| Proxy route state | Whether reverse-proxy route configuration is applied/ready. | Yes when route data exists |
| Public access probe | Whether the current resource URL responds as expected. | Yes when explicitly requested with live mode |
| Edge access failure diagnostic | Recent provider-neutral gateway failure envelope for a public route request. | Future read source |
| Runtime logs | Evidence for diagnostics, not health proof by itself. | Diagnostic-only |

Runtime log text must not be used as the sole health predicate.

## End-To-End Flow

Cached summary flow:

```text
resources.health({ mode: "cached" })
  -> validate resource id
  -> load resource read model
  -> load latest deployment/runtime/access/proxy observation state
  -> aggregate status into ResourceHealthSummary
  -> return ok(summary)
```

Live observation flow:

```text
resources.health({ mode: "live" })
  -> validate resource id and caller visibility
  -> resolve current runtime instance
  -> run bounded read-only runtime inspection when adapter supports it
  -> run configured HTTP or command health check when allowed
  -> optionally probe current public route
  -> aggregate status
  -> return ok(summary)
```

If live observation persists the latest summary for navigation/list performance, that persistence
belongs to an internal observer/process and must not be hidden inside a read query unless a future
ADR accepts query-time cache writes.

Existing-resource policy configuration flow:

```text
resources.configure-health({ resourceId, healthCheck })
  -> persist resource-owned health policy
  -> publish resource-health-policy-configured
  -> resources.health({ resourceId, mode: "live" })
  -> evaluate current runtime/public access using the configured policy when supported
```

## Status Aggregation

Aggregation follows priority rules:

1. Any explicit failed required signal yields `unhealthy`, unless another running instance is still
   starting and no terminal failure has been observed.
2. Restarting/crash-loop/degraded lifecycle yields `unhealthy` or `degraded` according to adapter
   evidence.
3. Starting lifecycle yields `starting`.
4. Running with all required checks passing yields `healthy`.
5. Running with health policy missing or unsupported yields `unknown`.
6. Public route failure with healthy internal runtime yields `degraded`.
7. No runtime instance yields `not-deployed` or `stopped` depending on deployment history.

For multi-service resources such as Compose stacks, the selected traffic service controls public
access health. Non-traffic services can degrade the overall status when they are required by the
resource profile, but optional/excluded services must not make the resource unhealthy.

## Public Access And Domain Relationship

Public access health is resource-scoped.

Durable domain bindings belong to the resource. Each deployment for the same resource should reuse
the same ready domain binding unless the binding, destination, target, or path policy changes.

When a durable domain binding exists but is not ready, resource health must keep that durable domain
visible as the public-access target with a not-ready/degraded reason. Generated or server-applied
fallback routes may still be listed as context, but they must not hide the fact that the current
durable domain is pending verification, certificate issuance, or route recovery.

Deployment snapshots may record route metadata used by that attempt. They are immutable history and
must not become the domain ownership boundary.

Generated default access should prefer stable resource-scoped hostnames for v1. Deployment-scoped
generated hostnames are allowed only when a provider's policy requires them, and the read model must
make that scope explicit.

## Error And Failure Visibility

The workflow returns `ok(ResourceHealthSummary)` when the resource is found and a safe summary can
be built, even if some signal sources fail.

Examples:

- Docker inspect unavailable: `overall = unknown`, `sourceErrors[]` contains `runtime_inspection_failed`.
- HTTP check returns 500: `overall = unhealthy`, check status is `failed`.
- Public route timeout but internal health passes: `overall = degraded`.
- Edge gateway reports `resource_access_upstream_timeout`: `overall = degraded` unless runtime
  health also proves an internal failure.
- No health policy configured: `overall = unknown`, policy status is `not-configured`.

Route/access blocking reasons must use the shared route intent/status vocabulary from
[Route Intent/Status And Access Diagnostics](../specs/020-route-intent-status-and-access-diagnostics/spec.md).
Runtime-not-ready, health-check-failing, proxy-route-missing/stale, domain-not-verified,
certificate-missing/expired/not-active, DNS-points-elsewhere, server-applied-route-unavailable, and
observation-unavailable cases are health/read-model diagnostics unless the deployment execution
workflow itself failed.

Whole-query `err(DomainError)` is reserved for:

- invalid input;
- missing or invisible resource;
- permission failure;
- read-model/storage failure that prevents safe summary construction.

## Entry Behavior

| Surface | Contract |
| --- | --- |
| Resource detail | Shows `ResourceHealthSummary.overall`, latest observed time, runtime health, public access/proxy health, and latest deployment as context. |
| Sidebar | Shows compact resource health when available; may fall back to latest deployment status during migration only. |
| Project resource list | Shows compact health plus latest deployment context. |
| Deployment detail | May show the attempt's verify result and route snapshot, but must link back to resource current health. |
| Diagnostic summary | Includes current health fields once the query/projection exists. |
| CLI/API | Expose the same query contract without transport-specific health semantics. |

## Current Implementation Notes And Migration Gaps

`resources.health` is implemented as an aggregation query. It reads the resource read model,
resource-owned health policy, latest deployment context, deployment runtime plan health path,
resource access summary, and proxy route status, then returns `ResourceHealthSummary`.

The first implementation deliberately keeps a succeeded deployment with no current health proof as
`overall = "unknown"` and uses failed proxy/public access state to report `degraded`.

Web resource header, resource health panel, sidebar, project list, and project resource list use
`ResourceHealthSummary.overall`. Latest deployment status remains visible only as deployment
context.

Current runtime deployment execution still performs attempt-time health checks and fails the
deployment attempt when local loopback/container checks fail. Those checks remain attempt-scoped
until provider-native runtime/container inspection feeds resource-owned health observation.

Bounded live HTTP policy and public access probes are implemented for safe HTTP targets. Durable
domain readiness composition now uses domain binding records so pending/non-ready durable domains
degrade public access instead of being hidden by fallback routes. Docker health-state inspection,
command policy execution, and scheduled summary persistence are still future work.

## Open Questions

- Should live observation persist a summary immediately, or should persistence be limited to a
  scheduled/internal observer?
- Which services in a Compose stack are required for resource health in the first implementation?
- Should public access probing be enabled by default or requested explicitly to avoid noisy traffic?
