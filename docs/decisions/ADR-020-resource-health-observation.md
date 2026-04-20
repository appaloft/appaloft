# ADR-020: Resource Health Observation

Status: Accepted

Date: 2026-04-15

## Decision

Resource health is a resource-owned observation concern. It is not the same as deployment attempt
success.

The resource detail page, project resource lists, and sidebar navigation must display current
resource health when that projection is available. Latest deployment status remains useful history,
but it must not be presented as the resource's current runtime health.

The accepted public read boundary is:

```text
resources.health
```

The query returns a resource-scoped health summary derived from runtime, container/process,
configured health policy, proxy route, and public access observations. It is read-only. It must not
create deployments, restart containers, apply proxy configuration, mutate health policy, or mark a
deployment succeeded or failed.

Health policy is reusable resource runtime/profile configuration. It belongs to the resource side
of the model, not to `deployments.create`. A future resource configuration command may update the
policy, but `deployments.create` must stay ids-only.

## Context

Users can currently see a deployment marked `succeeded` while the public access URL is not usable.
That is not a contradiction: the deployment attempt reached its terminal success state, but the
resource may still be unreachable, unhealthy, missing a configured health check, or behind a broken
proxy route.

Appaloft already has deployment-time health checks in runtime adapters. That behavior verifies one
deployment attempt during execution. It does not provide a durable, resource-owned current health
view for the latest runtime instance.

Coolify's current model is useful prior art:

- application health checks can be HTTP or command based;
- HTTP checks include method, scheme, host, port, path, expected return code, optional response
  text, interval, timeout, retries, and start period;
- generated HTTP checks run inside the container against `localhost:<port><path>` using `curl` or
  `wget`, or use a configured command for command checks;
- deployment waits for the configured start period, then polls Docker container health status with
  retries and records Docker health logs/output;
- resource status is aggregated from Docker runtime state plus health state into machine-readable
  values such as `running:healthy`, `running:unknown`, `running:unhealthy`,
  `starting:unknown`, `degraded:unhealthy`, and `exited`;
- Coolify warns that no configured health check means the resource may work, but readiness is
  unknown. It also warns that failing health checks can make the resource inaccessible behind
  Traefik/Caddy.

References observed during this Spec Round:

- Coolify source commit `57ea0764b8f0a491fd1d30bedc5cbe281744b36c`:
  [`ApplicationDeploymentJob`](https://github.com/coollabsio/coolify/blob/57ea0764b8f0a491fd1d30bedc5cbe281744b36c/app/Jobs/ApplicationDeploymentJob.php)
- Coolify status aggregation:
  [`ContainerStatusAggregator`](https://github.com/coollabsio/coolify/blob/57ea0764b8f0a491fd1d30bedc5cbe281744b36c/app/Services/ContainerStatusAggregator.php)
- Coolify health-check form:
  [`health-checks.blade.php`](https://github.com/coollabsio/coolify/blob/57ea0764b8f0a491fd1d30bedc5cbe281744b36c/resources/views/livewire/project/shared/health-checks.blade.php)
- Coolify docs:
  [Health checks](https://coolify.io/docs/knowledge-base/health-checks)

The local Coolify instance on port 8000 returns `OK` from `/api/health`, `/api/v1/health`, and
`/healthcheck`. Its Docker healthcheck runs `curl --fail http://127.0.0.1:8080/api/health ||
exit 1` with a 5s interval, 2s timeout, and 10 retries. That endpoint proves Coolify's own process
health only; it is not a generic application resource-health contract.

## Chosen Rule

`resources.health` observes a resource, not a deployment attempt.

The query must distinguish:

| Concept | Meaning |
| --- | --- |
| Deployment status | Historical state of one accepted deployment attempt. |
| Runtime lifecycle | Whether the current resource runtime instance is starting, running, restarting, stopped, exited, degraded, or unknown. |
| Configured health check | The resource-owned HTTP or command policy used to evaluate readiness when present. |
| Runtime health | The latest result of container/process health checks or provider-native health state. |
| Public access health | Whether the generated or durable public route can be reached according to the resource health policy. |
| Proxy route health | Whether the selected edge proxy route is configured and ready for the resource endpoint. |

The user-facing status for a resource should be derived from these signals with this priority:

1. failed/degraded runtime lifecycle or failed required health check;
2. starting/restarting lifecycle;
3. healthy runtime plus ready required proxy/access checks;
4. running with no configured health check or no access route as `unknown`, not `succeeded`;
5. no current deployment/runtime instance as `not-deployed`;
6. observation failure as `unknown` or `unavailable` with a structured reason.

Deployment success may appear inside the health summary as supporting context, but it cannot
override runtime or public-access failure.

## Health Policy Model

The minimum resource health policy is:

```ts
type ResourceHealthPolicy = {
  enabled: boolean;
  type: "http" | "command";
  intervalSeconds: number;
  timeoutSeconds: number;
  retries: number;
  startPeriodSeconds: number;
  http?: {
    method: "GET" | "POST" | "HEAD";
    scheme: "http" | "https";
    host: string;
    port?: number;
    path: string;
    expectedStatusCode: number;
    expectedResponseText?: string;
  };
  command?: {
    command: string;
  };
};
```

Default HTTP policy resolution:

- `port` defaults to `ResourceNetworkProfile.internalPort`;
- `scheme` defaults to `http`;
- `host` defaults to `localhost` for container/internal probes;
- `path` defaults to the existing `runtimeProfile.healthCheckPath` or `/`;
- expected status defaults to `200`;
- response-text matching is optional and must be bounded.

Command policies run inside the workload runtime boundary when the runtime adapter supports that.
They must reject shell metacharacters and multiline commands unless a future ADR accepts a stronger
sandbox model.

## Query Read Model

The first read model is:

```text
ResourceHealthSummary
```

It is query/projection state, not `Resource` aggregate state. It may combine:

- latest deployment snapshot and runtime plan;
- resource source/runtime/network profile;
- runtime adapter inspection results;
- provider-native container/process health;
- access route/proxy state;
- bounded HTTP or command probe output;
- stable error codes and observation timestamps.

Read models may store the latest observed summary for efficient lists/navigation. A live query may
perform bounded read-only inspection when explicitly requested by the query spec, but it must not
mutate resource, deployment, proxy, or runtime state.

## Consequences

The sidebar and resource list must not use deployment status as current resource status. They
should show unknown health while `ResourceHealthSummary` is absent, then switch to compact resource
health once the projection is implemented.

Resource detail should show:

- current resource health status;
- last observed time;
- latest deployment status as context;
- runtime/container status;
- health check policy and result;
- public access/proxy result;
- structured failure reason and retry/update affordances only when corresponding commands exist.

`deployments.create` may keep verifying the new deployment attempt during execution, but the
long-lived current status belongs to resource health observation.

## Governed Specs

- [Business Operation Map](../BUSINESS_OPERATION_MAP.md)
- [Core Operations](../CORE_OPERATIONS.md)
- [Domain Model](../DOMAIN_MODEL.md)
- [Project Resource Console Workflow Spec](../workflows/project-resource-console.md)
- [resources.health Query Spec](../queries/resources.health.md)
- [Resource Health Observation Workflow Spec](../workflows/resource-health-observation.md)
- [Resource Access Failure Diagnostics Workflow Spec](../workflows/resource-access-failure-diagnostics.md)
- [Resource Health Error Spec](../errors/resources.health.md)
- [Resource Health Test Matrix](../testing/resource-health-test-matrix.md)
- [Resource Health Implementation Plan](../implementation/resource-health-plan.md)
- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](./ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-013: Project Resource Navigation And Deployment Ownership](./ADR-013-project-resource-navigation-and-deployment-ownership.md)
- [ADR-015: Resource Network Profile](./ADR-015-resource-network-profile.md)
- [ADR-017: Default Access Domain And Proxy Routing](./ADR-017-default-access-domain-and-proxy-routing.md)
- [ADR-019: Edge Proxy Provider And Observable Configuration](./ADR-019-edge-proxy-provider-and-observable-configuration.md)

## Current Implementation Notes And Migration Gaps

Runtime adapters currently perform deployment-time health checks against local loopback URLs and
mark the deployment attempt failed when those checks fail.

`RuntimeDeploymentHealthChecker` currently builds health URLs from deployment route metadata. That
is deployment-scoped and should be migrated or wrapped behind resource health observation rather
than exposed as the final public model.

`resources.health` and `ResourceHealthSummary` now exist as a cached/read-model aggregation slice.
They are exposed through operation catalog, oRPC/HTTP, CLI, contracts, and Web resource surfaces.
The Web sidebar, resource header, resource detail health panel, project list, and project resource
list use `ResourceHealthSummary.overall` instead of latest deployment status.

The current implementation runs bounded HTTP health policy probes and optional public access probes
when callers request `resources.health({ mode: "live" })` and a safe target URL can be resolved.
Provider-native runtime/container inspection and command health checks remain future adapter work.

Edge request failure diagnostics are a future read source for public-access/proxy health. They map
gateway-generated failures into `resource_access_*` codes and must enter health summaries as
source errors/check evidence, not as deployment status changes or aggregate `domain` errors.

`ResourceRuntimeProfile.healthCheck` now exists for first-deploy resource creation and is mirrored
into runtime plans for deployment-time HTTP verification. Existing resources update this reusable
policy through the dedicated `resources.configure-health` command.

## Open Questions

- Should scheduled health observation be owned by a background job before Web shows health as the
  primary sidebar status?
