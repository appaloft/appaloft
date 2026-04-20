# ADR-019: Edge Proxy Provider And Observable Configuration

Status: Accepted

Date: 2026-04-15

## Decision

Appaloft must model edge proxy behavior through provider-neutral application ports and expose generated proxy configuration through a read/query surface.

Core and application code must not branch on concrete edge proxy implementations such as a specific reverse-proxy product. They may depend only on provider-neutral concepts:

- `EdgeProxyProvider`;
- `EdgeProxyProviderRegistry`;
- `EdgeProxyEnsurePlan`;
- `ProxyRouteRealizationPlan`;
- `ProxyReloadPlan`;
- `ProxyConfigurationView`.

Concrete edge proxy providers own provider-specific decisions:

- how the shared proxy is installed or ensured on a deployment target;
- whether route realization is expressed as Docker labels, config files, commands, provider API calls, or runtime manifests;
- how provider-neutral canonical redirects are rendered, including redirect middleware, redirect
  status code, source-host certificate coverage, and path/query preservation;
- whether realized route or certificate changes become active through automatic provider reload,
  dynamic-provider watching, or an explicit reload command;
- how logs, health checks, diagnostics, and generated configuration sections are collected;
- how concrete gateway/request failure signals are translated into provider-neutral resource
  access failure diagnostics;
- how resource routes target destination-local workloads.

The first concrete provider packages must live under:

```text
packages/providers/edge-proxy-*
```

The composition root selects and registers provider implementations. Application services, command handlers, query handlers, process managers, Web transports, CLI transports, and runtime orchestration must use the registered provider interface or provider registry instead of hardcoded implementation switches.

## Context

Generated default access routes and durable domain bindings require an edge proxy for reverse-proxy resources. Operators also need to inspect the generated proxy configuration that will be or has been applied for a resource route.

The source-of-truth model needs two separate but connected boundaries:

1. Provider-neutral route intent and route snapshots owned by Appaloft workflows.
2. Provider-specific configuration rendering and application owned by edge proxy providers.

Proxy configuration must not remain an opaque side effect hidden inside runtime execution. Resource detail, API, and CLI observation paths must be able to show a read-only provider-rendered configuration view for a resource route.

## Options Considered

| Option | Rule | Decision |
| --- | --- | --- |
| Runtime adapter hardcodes proxy products | Runtime code switches on concrete proxy kind and creates labels/config directly. | Rejected. This makes provider replacement, testing, and user-visible configuration difficult. |
| Edge proxy as standalone aggregate root in v1 | Proxy installations and routes become their own aggregate with command lifecycle. | Rejected for v1. No independent user-facing invariants require a standalone aggregate yet. |
| Provider-neutral interface plus read/query view | Application uses a provider interface; concrete providers render/apply config and expose a read-only view. | Accepted. This keeps domain language stable and makes proxy behavior observable. |

## Chosen Rule

### Provider Boundary

Application-facing code may depend on a provider-neutral port such as:

```ts
interface EdgeProxyProvider {
  readonly key: string;
  readonly capabilities: EdgeProxyProviderCapabilities;

  ensureProxy(
    context: EdgeProxyExecutionContext,
    input: EdgeProxyEnsureInput,
  ): Promise<Result<EdgeProxyEnsurePlan, DomainError>>;

  realizeRoutes(
    context: EdgeProxyExecutionContext,
    input: ProxyRouteRealizationInput,
  ): Promise<Result<ProxyRouteRealizationPlan, DomainError>>;

  reloadProxy(
    context: EdgeProxyExecutionContext,
    input: ProxyReloadInput,
  ): Promise<Result<ProxyReloadPlan, DomainError>>;

  renderConfigurationView(
    context: EdgeProxyExecutionContext,
    input: ProxyConfigurationViewInput,
  ): Promise<Result<ProxyConfigurationView, DomainError>>;
}
```

The exact TypeScript shape may be split into smaller ports, but the dependency direction is fixed:

```text
application/core -> provider-neutral port
composition root -> concrete provider package
runtime execution -> provider-produced plan
```

Provider selection must use a registry or injected provider key. Provider-specific package names, image names, label syntax, config-file syntax, and command details must not leak into core/application aggregate state, command schemas, error codes, operation keys, or workflow names.

### Provider Package Boundary

Concrete edge proxy providers live outside core/application:

```text
packages/providers/edge-proxy-traefik
packages/providers/edge-proxy-caddy
packages/providers/edge-proxy-*
```

These package names are implementation examples, not domain model names. A concrete provider package may generate labels, config files, container startup commands, log collection commands, health probes, and diagnostic metadata.

### Composition Root

The shell/Elysia composition root registers the active edge proxy provider or provider registry through dependency injection.

Transport adapters must not instantiate concrete providers. Application use cases and process managers must not call `new` on concrete provider classes.

### Runtime Execution

Runtime adapters execute provider-produced plans. They may still own transport details such as local shell execution, SSH execution, Docker command invocation, and log streaming, but they must not decide provider-specific route syntax through hardcoded switches.

Route realization remains idempotent. Re-running realization for the same deployment snapshot and provider key must not create duplicate routes.

Proxy reload is provider-owned route activation. Runtime adapters may execute only the provider's
reload plan after route or certificate-related proxy configuration has changed:

- providers that watch Docker labels or dynamic configuration may return an `automatic` reload plan
  with no command;
- providers that require an explicit reload must return command steps with timeout and safe
  metadata;
- runtime adapters must execute command steps after the route configuration is applied, before
  public route verification;
- reload failures are route-realization failures and must be recorded as structured async/runtime
  failures, not hidden in logs;
- application, Web, CLI, and HTTP code must not hardcode concrete reload commands.

### Observable Proxy Configuration

Appaloft must expose read-only resource-scoped proxy configuration through:

```text
resources.proxy-configuration.preview
```

This is an active public query and must remain registered in `CORE_OPERATIONS.md`, `operation-catalog.ts`, API/oRPC, CLI, Web, and tests together.

The query returns a provider-neutral wrapper with provider-rendered sections. Sections may contain provider-specific text because the output is an operator-facing read model, not a domain aggregate.

The view must support:

- planned configuration before first deployment when enough resource/server/policy state exists;
- latest realized configuration from the most recent relevant deployment snapshot;
- stale or drift status when the rendered desired state differs from the last applied snapshot;
- redacted sensitive values;
- copyable/read-only sections for labels, files, commands, route manifests, or diagnostics.

Viewing proxy configuration must not apply proxy configuration.

### Resource Access Failure Diagnostics

Appaloft may render a Cloudflare-style diagnostic response when an HTML browser request reaches the
Appaloft edge proxy but the proxy cannot complete the request to a resource route.

This is an adapter/read-model diagnostic surface. It is not a new aggregate, not a new public
command, and not a replacement for `resources.health`, `resources.diagnostic-summary`, or
`resources.proxy-configuration.preview`.

Concrete edge proxy providers must translate provider-specific gateway failures into a
provider-neutral failure envelope before Web, CLI, HTTP, or future MCP consumers display it:

```ts
type ResourceAccessFailureDiagnostic = {
  code: string;
  category: "infra" | "integration" | "timeout" | "not-found" | "async-processing";
  phase:
    | "edge-request-routing"
    | "proxy-route-observation"
    | "upstream-connection"
    | "upstream-response"
    | "proxy-route-realization"
    | "public-route-verification"
    | "diagnostic-page-render";
  httpStatus: 404 | 502 | 503 | 504;
  retriable: boolean;
  ownerHint: "platform" | "resource" | "operator-config" | "unknown";
  requestId: string;
  resourceId?: string;
  deploymentId?: string;
  serverId?: string;
  destinationId?: string;
  providerKey?: string;
  routeId?: string;
};
```

The page may show a three-hop status such as browser, Appaloft edge, and resource deployment. The
machine contract is still the stable diagnostic code, category, phase, retriable flag, request id,
and safe related ids.

The diagnostic taxonomy maps outer gateway failures into the shared platform error model:

| Code | Category | Phase | Owner hint | Meaning |
| --- | --- | --- | --- | --- |
| `resource_access_route_not_found` | `not-found` | `edge-request-routing` | `platform` or `operator-config` | The edge request reached Appaloft but no active route could be matched for the host/path. |
| `resource_access_proxy_unavailable` | `infra` | `proxy-route-observation` | `platform` | The route requires edge proxy infrastructure that is unavailable or not ready. |
| `resource_access_route_unavailable` | `infra` | `proxy-route-observation` | `platform` or `operator-config` | A known resource route exists but is not applied, stale, failed, or not ready. |
| `resource_access_upstream_unavailable` | `infra` | `upstream-connection` | `resource` | The route is known, but no current upstream target is available for the resource. |
| `resource_access_upstream_connect_failed` | `infra` | `upstream-connection` | `resource` | The edge proxy could not connect to the resource endpoint. |
| `resource_access_upstream_timeout` | `timeout` | `upstream-connection` | `resource` | The resource endpoint did not respond within the gateway timeout. |
| `resource_access_upstream_reset` | `infra` | `upstream-response` | `resource` | The upstream connection was reset before a complete response. |
| `resource_access_upstream_tls_failed` | `integration` | `upstream-connection` | `operator-config` | The proxy could not complete TLS or protocol negotiation to the upstream endpoint. |
| `resource_access_edge_error` | `infra` | `diagnostic-page-render` | `platform` | The edge diagnostic service or provider boundary failed while handling the gateway error. |
| `resource_access_unknown` | `infra` | `diagnostic-page-render` | `unknown` | The edge provider could not classify the gateway failure safely. |

These codes are outer observation codes. They must not be categorized as `domain` unless the
underlying cause is a true aggregate invariant or state-machine rejection from a command/query. If
a related deployment, server bootstrap, route realization, health, or diagnostic summary already
has a structured `DomainError`, the diagnostic response may link that code as `causeCode`, but it
must not replace the original operation's error contract.

The edge diagnostic response must not override user application responses by default. It is
eligible only for gateway-generated failures such as 404, 502, 503, or 504 where the edge proxy did
not successfully serve the upstream response. API callers should receive a structured problem
response with the same code/request id instead of an HTML page when the request does not accept
HTML.

### State Ownership

Edge proxy is not a standalone aggregate root in v1.

The v1 ownership model is:

| Concern | Owner |
| --- | --- |
| Proxy intent and readiness summary | `DeploymentTarget` aggregate/read model |
| Proxy bootstrap attempts | Server bootstrap/process workflow state |
| Resource upstream endpoint | `ResourceNetworkProfile` |
| Generated access hostname | Default access domain provider and route snapshot |
| Canonical redirect intent | Provider-neutral route state from server-applied config or future managed route configuration |
| Per-deployment route realization snapshot | Deployment/runtime plan snapshot |
| Provider-rendered visible config | Query/read model derived from provider output and snapshots |

Provider-rendered configuration view is not persisted as mutable domain state unless a future ADR introduces a separate audited proxy route aggregate or configuration override command.

## Consequences

Provider-specific proxy code becomes replaceable without changing command schemas or core aggregate language.

Resource detail, API, and CLI can show what proxy configuration Appaloft intends to apply or has applied. This reduces black-box runtime behavior and gives operators a stable debugging surface.

Existing route realization, proxy reload, and proxy bootstrap code must move behind concrete provider packages. Runtime adapters should become executors of provider-produced plans rather than authors of proxy-specific config.

Future user-editable proxy overrides require a separate ADR and command boundary. The v1 query is read-only.

## Governed Specs

- [Business Operation Map](../BUSINESS_OPERATION_MAP.md)
- [Core Operations](../CORE_OPERATIONS.md)
- [Domain Model](../DOMAIN_MODEL.md)
- [ADR-017: Default Access Domain And Proxy Routing](./ADR-017-default-access-domain-and-proxy-routing.md)
- [Default Access Domain And Proxy Routing Workflow](../workflows/default-access-domain-and-proxy-routing.md)
- [Server Bootstrap And Proxy Workflow](../workflows/server-bootstrap-and-proxy.md)
- [Edge Proxy Provider And Route Realization Workflow](../workflows/edge-proxy-provider-and-route-realization.md)
- [Resource Access Failure Diagnostics Workflow](../workflows/resource-access-failure-diagnostics.md)
- [resources.proxy-configuration.preview Query Spec](../queries/resources.proxy-configuration.preview.md)
- [Resource Access Failure Diagnostics Error Spec](../errors/resource-access-failure-diagnostics.md)
- [Default Access Domain And Proxy Routing Test Matrix](../testing/default-access-domain-and-proxy-routing-test-matrix.md)
- [Edge Proxy Provider And Route Configuration Test Matrix](../testing/edge-proxy-provider-and-route-configuration-test-matrix.md)
- [Resource Access Failure Diagnostics Test Matrix](../testing/resource-access-failure-diagnostics-test-matrix.md)
- [Edge Proxy Provider And Route Configuration Implementation Plan](../implementation/edge-proxy-provider-and-route-configuration-plan.md)
- [Resource Access Failure Diagnostics Implementation Plan](../implementation/resource-access-failure-diagnostics-plan.md)

## Superseded Open Questions

- Should concrete proxy implementations be hardcoded in runtime adapters?
- Where should proxy bootstrap, ensure, route config rendering, logs, and diagnostics live?
- Should users be able to see generated proxy labels/config before or after deployment?
- Is proxy configuration an aggregate state field or a read/query projection?
- Does every route realization require provider-specific branching in application code?

## Current Implementation Notes And Migration Gaps

Runtime execution now uses provider-produced ensure plans and route realization plans. Concrete provider syntax lives in separate edge proxy provider packages.

Current `DeploymentTarget` and runtime-plan data still expose concrete `proxyKind` values as an adapter-facing migration seam.

`resources.proxy-configuration.preview` is active for API/oRPC, CLI, and Web resource detail, but route input still comes from generated access summaries or deployment runtime-plan snapshots rather than a dedicated proxy-route read model.

Edge proxy providers currently render Docker bootstrap commands, Docker labels, provider-owned
reload plans, and read-only
diagnostic command plans for server connectivity checks. Traefik diagnostics include expected image
compatibility, Docker provider log scanning, and a bounded Docker-label route probe. Persisted
provider log collection and richer long-running diagnostic history remain future provider
capabilities.

## Open Questions

- None for the provider boundary, package location, and read-only proxy configuration query.
