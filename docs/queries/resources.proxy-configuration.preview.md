# resources.proxy-configuration.preview Query Spec

## Normative Contract

`resources.proxy-configuration.preview` is the active query for showing the provider-rendered edge proxy configuration for one resource.

This query is read-only. It never creates resources, creates deployments, installs proxies, applies route configuration, mutates snapshots, or edits provider policy.

The query is part of the active resource observation surface and must remain registered in `CORE_OPERATIONS.md`, `operation-catalog.ts`, API/oRPC, CLI, Web resource detail, and tests.

## Global References

This query inherits:

- [ADR-019: Edge Proxy Provider And Observable Configuration](../decisions/ADR-019-edge-proxy-provider-and-observable-configuration.md)
- [ADR-017: Default Access Domain And Proxy Routing](../decisions/ADR-017-default-access-domain-and-proxy-routing.md)
- [ADR-015: Resource Network Profile](../decisions/ADR-015-resource-network-profile.md)
- [Default Access Domain And Proxy Routing Workflow](../workflows/default-access-domain-and-proxy-routing.md)
- [Edge Proxy Provider And Route Realization Workflow](../workflows/edge-proxy-provider-and-route-realization.md)
- [Resource Access Failure Diagnostics Workflow](../workflows/resource-access-failure-diagnostics.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)

## Purpose

Show operators what Appaloft intends to apply, or has already applied, for a resource's edge proxy route.

It is not:

- a command;
- a route apply operation;
- a proxy bootstrap retry operation;
- a domain binding command;
- a certificate operation;
- a user-editable proxy override;
- a replacement for deployment logs.

## Input Model

```ts
type PreviewResourceProxyConfigurationInput = {
  resourceId: string;
  deploymentId?: string;
  routeScope?: "planned" | "latest" | "deployment-snapshot";
  includeDiagnostics?: boolean;
};
```

| Field | Requirement | Meaning |
| --- | --- | --- |
| `resourceId` | Required | Resource whose proxy configuration is being observed. |
| `deploymentId` | Conditional | Required when `routeScope = deployment-snapshot`; optional otherwise to force a specific realized snapshot. |
| `routeScope` | Optional | Defaults to `latest`. Selects planned pre-deployment config, latest realized config, or one deployment snapshot. |
| `includeDiagnostics` | Optional | Allows provider-safe diagnostics such as route inputs, warnings, and health probes. Secrets remain redacted. |

## Output Model

```ts
type PreviewResourceProxyConfigurationResult = Result<ProxyConfigurationView, DomainError>;

type ProxyConfigurationView = {
  resourceId: string;
  deploymentId?: string;
  providerKey: string;
  routeScope: "planned" | "latest" | "deployment-snapshot";
  status: "not-configured" | "planned" | "applied" | "stale" | "failed";
  generatedAt: string;
  lastAppliedDeploymentId?: string;
  stale: boolean;
  routes: ProxyConfigurationRouteView[];
  sections: ProxyConfigurationSection[];
  warnings: ProxyConfigurationWarning[];
  diagnostics?: ProxyConfigurationDiagnostics;
};
```

Route views use this provider-neutral shape:

```ts
type ProxyConfigurationRouteView = {
  hostname: string;
  scheme: "http" | "https";
  url: string;
  pathPrefix: string;
  tlsMode: "auto" | "disabled";
  targetPort?: number;
  source: "generated-default" | "deployment-snapshot" | "server-applied" | "domain-binding";
  routeBehavior?: "serve" | "redirect";
  redirectTo?: string;
  redirectStatus?: 301 | 302 | 307 | 308;
};
```

When `routeBehavior = "redirect"`, `url` is the redirect source URL and `redirectTo` is the
provider-neutral target host. The query may include provider-specific redirect syntax only in
read-only sections; Web, CLI, and API clients must not reconstruct redirect middleware locally.

Provider-rendered sections use this shape:

```ts
type ProxyConfigurationSection = {
  id: string;
  title: string;
  format: "docker-labels" | "file" | "command" | "yaml" | "json" | "text";
  language?: string;
  readonly: true;
  redacted: boolean;
  content: string;
  source: "provider-rendered" | "snapshot" | "diagnostic";
};
```

The wrapper fields are provider-neutral. Section `content` may be provider-specific because this is an operator-facing read model.

Per-request edge failures, such as a recent gateway timeout or upstream connection failure, belong
to [Resource Access Failure Diagnostics](../workflows/resource-access-failure-diagnostics.md). The
proxy configuration query may show provider-rendered diagnostic sections and route readiness, but it
must not become the primary request-failure event store.

## Query Flow

The query must:

1. Validate input.
2. Resolve the resource read model and owning project/environment context.
3. Resolve resource network profile and access summary.
4. Select planned, latest, or deployment snapshot route state.
5. Resolve the registered `EdgeProxyProvider` by provider key or server proxy intent.
6. Ask the provider to render a read-only configuration view.
7. Redact sensitive values.
8. Return `ok(ProxyConfigurationView)`.

The query must not:

- call a command bus;
- apply runtime plans;
- run SSH or Docker mutating commands;
- modify provider policy;
- create domain bindings;
- persist generated configuration as aggregate state.

## Route Scope Semantics

| Scope | Meaning |
| --- | --- |
| `planned` | Render desired proxy configuration from persisted resource/server/policy state before the first deployment or before the latest deploy applies it. |
| `latest` | Render the most relevant current view, selecting durable ready domain route, server-applied config domain route, latest generated route, then planned generated route. When no current-route summary exists, fall back to the latest realized deployment route snapshot. |
| `deployment-snapshot` | Render configuration from one immutable deployment runtime-plan snapshot. |

If no proxy route is required, the query returns `ok` with `status = "not-configured"` and an empty `sections` array.

The query must preserve provider-neutral route source labels. Provider-rendered sections may contain
provider-specific syntax, but the wrapper route view must identify whether each route came from a
durable managed domain, server-applied config domain, generated/default access, or an immutable
deployment snapshot fallback.

## Web / API / CLI Use

Web resource detail must show this query as a read-only proxy configuration view. It may group sections as labels, files, commands, route manifest, and diagnostics.

API and oRPC must expose the same query input/output schema.

CLI exposes the query through:

```text
appaloft resource proxy-config <resourceId>
```

CLI and Web must not re-render provider-specific config locally. They display query output.

## Error Codes

All errors use [Error Model](../errors/model.md).

| Error code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `query-validation` | No | Input shape or route scope is invalid. |
| `not_found` | `resource-resolution` | No | Resource or requested deployment snapshot does not exist. |
| `resource_network_profile_missing` | `resource-network-resolution` | No | Planned route needs a resource network profile that is not available. |
| `proxy_provider_unavailable` | `proxy-provider-resolution` | Conditional | Required edge proxy provider is not registered or unavailable. |
| `proxy_route_not_resolved` | `route-snapshot-resolution` | Conditional | No route state exists for the requested scope. |
| `proxy_configuration_render_failed` | `proxy-configuration-render` | Conditional | Provider failed to render a safe configuration view. |
| `infra_error` | `read-model-load` | Conditional | Read model or snapshot data could not be loaded. |

## Testing Requirements

Tests must assert:

- the query has no write side effects;
- provider-specific content appears only inside returned sections;
- application code resolves providers through a provider registry/port;
- planned configuration can be rendered before first deployment when state is sufficient;
- latest realized configuration comes from deployment route snapshots;
- sensitive values are redacted;
- missing provider and missing route state return structured error codes;
- Web/API/CLI display query output rather than reconstructing provider-specific config.

## Current Implementation Notes And Migration Gaps

`ResourceAccessSummary` exposes generated route URL/status, but not full provider-rendered proxy configuration sections. The query renders sections through the provider at read time.

Runtime adapters execute provider-produced plans. Concrete provider rendering now lives in provider packages.

The query selects the edge proxy provider from the route `proxyKind`; generated default-access
domain provider keys such as `sslip` are access-domain metadata and must not override edge proxy
provider selection.

The query is active through API/oRPC, CLI, and Web resource detail. A dedicated provider route projection is still future work.

## Open Questions

- None for the read-only query boundary.
