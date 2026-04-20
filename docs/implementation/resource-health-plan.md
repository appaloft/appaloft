# Resource Health Implementation Plan

## Source Of Truth

This document is an implementation-planning contract for `resources.health`. It does not replace
ADRs, query specs, workflow specs, error specs, or test matrices.

## Governed ADRs

- [ADR-020: Resource Health Observation](../decisions/ADR-020-resource-health-observation.md)
- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-013: Project Resource Navigation And Deployment Ownership](../decisions/ADR-013-project-resource-navigation-and-deployment-ownership.md)
- [ADR-015: Resource Network Profile](../decisions/ADR-015-resource-network-profile.md)
- [ADR-017: Default Access Domain And Proxy Routing](../decisions/ADR-017-default-access-domain-and-proxy-routing.md)
- [ADR-019: Edge Proxy Provider And Observable Configuration](../decisions/ADR-019-edge-proxy-provider-and-observable-configuration.md)

## Governed Specs

- [resources.health Query Spec](../queries/resources.health.md)
- [Resource Health Observation Workflow Spec](../workflows/resource-health-observation.md)
- [Resource Health Error Spec](../errors/resources.health.md)
- [Resource Health Test Matrix](../testing/resource-health-test-matrix.md)
- [Resource Access Failure Diagnostics Workflow Spec](../workflows/resource-access-failure-diagnostics.md)
- [Project Resource Console Workflow Spec](../workflows/project-resource-console.md)
- [Project Resource Console Test Matrix](../testing/project-resource-console-test-matrix.md)
- [resources.runtime-logs Query Spec](../queries/resources.runtime-logs.md)
- [resources.proxy-configuration.preview Query Spec](../queries/resources.proxy-configuration.preview.md)
- [Core Operations](../CORE_OPERATIONS.md)
- [Domain Model](../DOMAIN_MODEL.md)

## Expected Application Scope

Add a vertical query slice under `packages/application/src/operations/resources/`:

- `resource-health.schema.ts`;
- `resource-health.query.ts`;
- `resource-health.handler.ts`;
- `resource-health.query-service.ts`.

Add application ports/tokens as needed:

- a read-only `ResourceHealthObservationReader` or equivalent read-model port;
- a read-only `RuntimeHealthInspector` for runtime/container/process lifecycle and health state;
- a bounded `ResourceHealthProbeRunner` for HTTP policy and public access execution when live mode
  is requested;
- a bounded `ResourcePublicAccessProbe` for public URL checks when explicitly requested;
- `tokens.resourceHealthQueryService`.

The query handler must delegate to the query service and return the typed `Result`.

The query service should compose existing read/query services or read-model ports for:

- resource context and profile;
- latest deployment/runtime plan context;
- `ResourceAccessSummary`;
- latest safe edge access failure diagnostics when a provider/read-model source exists;
- domain binding readiness;
- edge proxy route readiness/provider status;
- runtime/container/process inspection;
- configured health policy and latest check result.

It must preserve partial source failures inside the summary and avoid transport-specific
formatting.

## Expected Adapter Scope

Runtime adapters should expose read-only health inspection, separate from deployment execution:

- local Docker/container status and health log summary;
- process/task lifecycle where no container health state exists;
- bounded HTTP probe against the internal endpoint;
- command probe inside the workload runtime only when the adapter can do so safely.

Adapters must not mutate containers, restart workloads, apply proxy configuration, edit routes, or
mark deployments terminal while serving this query.

Public access probes must be bounded by timeout, redirect limit, response size, and retry policy.
They must not send credentials or private headers.

`resources.configure-health` adds a command slice under `packages/application/src/operations/resources/`
that loads the `Resource` aggregate, mutates `ResourceRuntimeProfile.healthCheck`, persists through
the resource repository, and publishes `resource-health-policy-configured`.

## Expected Transport Scope

oRPC/HTTP exposes:

```text
GET /api/resources/{resourceId}/health
```

using `ResourceHealthQueryInput`.

CLI exposes:

```text
appaloft resource health <resourceId> [--live] [--json]
```

CLI should print canonical JSON in `--json` mode and a concise section summary in human mode.

Transports must not define parallel health input/output shapes.

## Expected Web And Desktop Scope

Resource detail should include a current health panel that shows:

- `ResourceHealthSummary.overall`;
- last observed time;
- latest deployment status as context;
- runtime/container status;
- configured health policy and latest result;
- public access/proxy status;
- source errors and stable codes in details.

Project resource lists and sidebar should prefer a compact resource health projection over latest
deployment status. Latest deployment status may remain a migration fallback until the projection is
available, but UI copy must not call that fallback current health.

Access URL display belongs on resource detail because durable domains and current generated access
are resource-scoped observations. Deployment detail may show the immutable route snapshot used by
that attempt as history.

## Operation Catalog Scope

During the Code Round that promotes this behavior to active, add `resources.health` to:

- [Core Operations](../CORE_OPERATIONS.md) implemented operations table;
- `packages/application/src/operation-catalog.ts`;
- HTTP/oRPC operation metadata;
- CLI help/command registration;
- Web query helpers;
- contracts exports.

Do not add the operation to the active catalog until the query, schema, service, transport mapping,
entry affordance, and tests are aligned.

## Minimal Deliverable

The minimal Code Round deliverable is:

- application query slice and schema;
- fake/in-memory health observation sources for application tests;
- cached `ResourceHealthSummary` output with correct aggregation;
- bounded live HTTP probe adapter for local/public URLs where current metadata allows it;
- `resources.configure-health` command/API/CLI/Web affordance for existing resources;
- Web resource detail status panel and resource access URL panel;
- tests for deployment success plus inaccessible resource, missing policy, unhealthy runtime,
  public route failure, durable-domain precedence, and no write side effects.

Live public access probing and command health checks may be deferred if cached/runtime inspection
is enough for the first safe slice.

## Required Tests

Required coverage follows [Resource Health Test Matrix](../testing/resource-health-test-matrix.md):

- query validation and missing resource;
- no deployments/no runtime;
- latest deployment succeeded but public access fails;
- latest deployment succeeded but runtime/container health is unhealthy;
- running with missing health policy is `unknown`;
- HTTP policy default resolution from `ResourceNetworkProfile.internalPort`;
- durable domain binding precedes generated route;
- proxy route missing or not ready;
- runtime inspection source failure as partial summary;
- API/oRPC uses the shared query schema;
- Web/sidebar prefer health projection over deployment status when available.

## Migration Seams And Legacy Edges

Existing deployment-time health verification remains part of `deployments.create` execution. It can
feed the health observation read model, but it must not be the public resource-health boundary.

Existing `lastDeploymentStatus` fields may remain as contextual deployment data until a health
projection is available. They must not drive current resource health in navigation.

Existing generated access route snapshots can be used as historical context. Current access should
come from resource-scoped access summary and domain binding state.

Edge request failure diagnostics can feed public access/proxy sections as source errors, but they
must remain read-only observation input. They must not mutate health policy, deployment status,
route realization state, or domain binding readiness.

## Current Implementation Notes And Migration Gaps

`resources.health` is implemented as a first aggregation slice with bounded live HTTP/public
probes.

Implemented scope:

- application schema/query/handler/service under `packages/application/src/operations/resources/`;
- `resources.configure-health` command schema/handler/use case and resource aggregate mutation;
- operation catalog, tokens, DI registration, contracts, oRPC/HTTP, and CLI command wiring;
- Web resource detail health panel, resource access URL panel, sidebar compact health, project list
  compact health, and project resource-list compact health;
- application tests in `packages/application/test/resource-health.test.ts` for no deployment,
  deployment success without health proof, failed public/proxy access, in-flight deployment,
  configured policy without a current probe, and live HTTP policy pass/fail;
- application tests in `packages/application/test/configure-resource-health.test.ts` for policy
  persistence, disabled policy, not found, and event publication.

Current implementation reads latest deployment context, resource-owned health policy, runtime
lifecycle inferred from deployment state, configured deployment snapshot health path as fallback,
resource access summary, and proxy route status. It deliberately keeps `overall = "unknown"` for a
succeeded deployment when no configured/current health observation proves health.

Still deferred:

- provider-native runtime/container inspection and Docker health state;
- command health checks;
- durable-domain readiness composition from domain binding records inside the health query;
- background/scheduled health observation projection.
- edge request failure diagnostic source composition using `resource_access_*` codes.

## Open Questions

- Should `mode = "live"` remain a read-time probe once adapters exist, or should all live checks be
  performed by a scheduled observer and served from cached read-model state?
- Should command health checks be accepted before a stronger command sandbox model exists?
