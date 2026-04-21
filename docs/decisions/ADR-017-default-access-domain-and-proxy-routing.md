# ADR-017: Default Access Domain And Proxy Routing

Status: Accepted

Date: 2026-04-15

## Decision

Appaloft supports generated default access domains for resources, but the generated-domain provider is an infrastructure adapter selected by configuration and dependency injection. Core and application code must not know the concrete provider brand, hostname suffix, DNS algorithm, or provider-specific naming rules.

The platform model is:

```text
ResourceNetworkProfile
  -> DefaultAccessDomainPolicy
  -> DefaultAccessDomainProvider port
  -> GeneratedAccessRouteSnapshot
  -> EdgeProxyProvider route realization
```

The default v1 deployment experience may use a configured provider implementation that generates hostnames from the target public address. The provider can be an `sslip.io` style implementation, a wildcard-domain implementation, a custom template implementation, or a disabled/no-op implementation. The concrete implementation is registered in the composition root and injected behind a generic port.

The core/application domain language is provider-neutral:

- `DefaultAccessDomainPolicy`
- `DefaultAccessDomainProvider`
- `GeneratedAccessDomain`
- `GeneratedAccessRouteSnapshot`
- `ResourceAccessProfile`
- `ProxyRouteRealization`

The following names must not appear in core or application domain types, command schemas, error codes, or operation keys:

- concrete DNS service names;
- provider-specific hostname suffixes;
- provider-specific resolver algorithms.

Provider names may appear only in infrastructure packages, provider packages, configuration examples, logs, migration notes, and operator documentation.

## Chosen Rule

Default generated access is not a `deployments.create` input field and not a hidden domain binding command.

`deployments.create` remains ids-only. During deployment planning/execution, the application/runtime boundary resolves any access routes from:

1. the resource network profile;
2. the selected deployment target/server proxy readiness;
3. durable domain bindings that already exist and are ready enough to route;
4. a configured default access domain policy/provider.

The generated default access route is a convenience route for reaching a resource after deployment. It is not proof of domain ownership, not a durable custom `DomainBinding`, and not a certificate lifecycle record.

Durable custom domains still use `domain-bindings.create` and certificate commands.

## Provider Boundary

Application code may depend on a generic port with provider-neutral language:

```ts
interface DefaultAccessDomainProvider {
  generate(input: DefaultAccessDomainRequest): Promise<Result<GeneratedAccessDomain, DomainError>>;
}
```

The port input may include only platform concepts:

- deployment target public address or resolved public host;
- project id;
- environment id;
- resource id;
- resource slug/name;
- destination id;
- deployment id or attempt id only when a provider policy explicitly requires a
  deployment-scoped route;
- requested route purpose;
- correlation id and causation id.

The port output may include only provider-neutral fields:

- generated hostname;
- scheme hint;
- provider key as an opaque string for audit/read-model display;
- expiry/refresh metadata if the provider has any;
- safe diagnostic metadata.

The concrete provider implementation is instantiated outside core/application and registered through dependency injection. The composition root decides which provider is active from runtime configuration. A disabled provider must return a typed no-route result or a non-retriable policy error according to the workflow using it.

## Policy And Scope

The default access domain policy is configuration and must become a public business command before users can change it from Web, CLI, API, automation, or future MCP tools.

The accepted future command boundary is:

```text
default-access-domain-policies.configure
```

The command configures provider-neutral policy state. It must not expose concrete generated-domain provider internals as domain fields. Concrete providers are selected by opaque provider key and adapter configuration.

The policy must support these modes:

| Mode | Meaning |
| --- | --- |
| `disabled` | Do not generate default public hostnames. Deployments may still be reachable through explicit domain bindings or direct-port exposure when those behaviors are configured. |
| `provider` | Use the configured generic provider port to generate a hostname. |
| `custom-template` | Use an injected provider implementation that resolves a configured hostname template without leaking template syntax into core/application. |

Policy resolution follows the platform configuration precedence when the corresponding scopes exist:

```text
defaults < system < organization < project < environment < deployment target < resource < deployment snapshot
```

The v1 minimum must support a system default and a deployment-target/server override. Project, environment, and resource overrides may be added later through explicit configuration operations without changing the core boundary.

The resolved policy used by one deployment must be copied into the deployment/runtime plan snapshot as provider-neutral access-route metadata. Later policy changes must not rewrite historical deployment snapshots.

Until `default-access-domain-policies.configure` is implemented and exposed as an active operation, installations may use static configuration or server bootstrap configuration to select the provider. That static seam must not become a hidden business rule and must be replaced by the public command before user-facing policy editing is shipped.

## Read Model Rule

The first formal read model for generated URLs is a resource-scoped access summary projection.

```text
ResourceAccessSummary
  -> resourceId
  -> plannedGeneratedAccessRoute
  -> latestGeneratedAccessRoute
  -> latestDurableDomainRoute
  -> proxyRouteStatus
  -> lastRouteRealizationDeploymentId
```

This projection is query/read-model state, not `Resource` aggregate state. It is derived from deployment route snapshots, domain binding read state, and server/proxy readiness.

`plannedGeneratedAccessRoute` is the pre-deployment generated route preview for an already persisted resource. It is computed from resource network profile, destination/server public address, edge proxy intent/readiness, and default access domain policy. It does not imply that runtime proxy configuration has been applied.

`latestGeneratedAccessRoute` is the post-deployment realized route derived from the latest relevant deployment snapshot.

Generated default access should prefer stable resource-scoped hostnames for v1. Repeated
deployments of the same resource should keep the same generated hostname when resource, target,
destination, and route path policy are unchanged. Deployment-scoped generated hostnames are allowed
only when the configured provider policy requires them, and the route scope must be explicit in the
read model.

Deployment snapshots still keep the immutable generated or durable route data used by one attempt. The resource access summary chooses the latest relevant route for resource detail, Quick Deploy completion, CLI output, and API reads.

## Resource Network And Proxy Relationship

Generated default access requires a resource endpoint.

For HTTP application resources, the upstream target is `ResourceNetworkProfile.internalPort` with `upstreamProtocol = "http"` and `exposureMode = "reverse-proxy"`.

Reverse-proxy exposure must not require a stable host-published application port. The edge proxy publishes public ingress ports such as 80/443. The resource workload should be reachable by the proxy through the destination-local runtime network and the resolved internal port.

Two resources on the same deployment target may use the same `ResourceNetworkProfile.internalPort`
under reverse-proxy exposure. Runtime adapters must isolate their workload instances and route
metadata by resource/deployment identity. They must not clean up, replace, or route by scanning all
containers/processes that publish the same internal application port.

Runtime adapters may expose the workload on a private loopback or runtime-local ephemeral host port
for internal health checks when their execution model requires it. That host port is not a public
route, not a durable domain binding, and not the edge proxy upstream contract.

`hostPort` is valid only for explicit `direct-port` exposure. It is not the default path for application resources and must not be used as a substitute for proxy routing.

## Server And Proxy Relationship

Generated default access requires an edge proxy when the resource exposure mode is `reverse-proxy`.

The server bootstrap workflow remains:

```text
servers.register
  -> servers.connect
  -> server-connected
  -> proxy-bootstrap-requested, when proxy is required
  -> proxy-installed | proxy-install-failed
  -> server-ready, when all readiness gates pass
```

The default access domain policy does not install the proxy by itself. If the selected deployment target has no proxy intent, or explicitly disables the proxy, generated default access is skipped for that attempt and the deployment may proceed without a public generated URL. If a proxy-backed route has been selected but proxy readiness or route realization fails, the deployment must produce a structured route-resolution or runtime failure.

If proxy bootstrap fails, the server may remain connected but not ready for proxy-backed deployments. Deployments that require generated proxy routes must reject admission or persist a post-acceptance failure according to where the failure is detected. They must not silently publish direct host ports as a fallback.

## Deployment Route Realization

Each accepted deployment attempt must materialize proxy route configuration idempotently when its resolved runtime plan contains generated or durable access routes.

Route realization is edge-proxy-provider work executed by runtime adapters. It may produce Docker labels, config files, commands, provider-specific route objects, or equivalent runtime metadata. The command contract remains provider-neutral.

Deployment route realization must use:

- generated or durable hostnames from resolved access-route state;
- `ResourceNetworkProfile.internalPort` or the resolved network snapshot as the upstream target;
- `pathPrefix` only from durable domain binding or future resource access profile state;
- TLS mode only from durable domain binding/certificate state or a provider-neutral default policy.
- redirect behavior only from provider-neutral route state owned by server-applied config domains,
  durable route configuration, or a future resource access profile command.

It must not read domain/proxy/TLS fields from `deployments.create` input.

## Domain Binding Relationship

Generated default access routes and durable domain bindings are different objects.

| Concern | Owner |
| --- | --- |
| Generated convenience hostname | Default access domain provider and resource access summary, with deployment snapshots as immutable history. |
| Durable custom domain ownership | `DomainBinding` aggregate. |
| Certificate issuance/renewal | Certificate workflow and provider adapter. |
| Proxy installation readiness | `DeploymentTarget` edge proxy state. |
| Per-deployment proxy labels/config | Runtime adapter route realization. |

A generated default hostname may be shown in Web/CLI/API as a public access URL after deployment. It must not create or imply a `DomainBinding` unless the user runs an explicit future command that promotes or binds it.

## Aggregate Boundary

Edge proxy is not a standalone aggregate root in v1.

The v1 model is:

- `DeploymentTarget` owns edge proxy intent, current proxy status, and readiness summary.
- Proxy bootstrap attempts belong to the server bootstrap/process workflow state.
- `ResourceNetworkProfile` owns the upstream endpoint.
- Deployment snapshots own the resolved route configuration used by one attempt.
- `DomainBinding` owns durable custom domain and TLS readiness.

A future `ProxyInstallation`, `ProxyRoute`, or `ResourceAccessProfile` aggregate may be introduced only if its invariants require independent lifecycle, repository, and command boundaries.

## Governed Specs

- [Business Operation Map](../BUSINESS_OPERATION_MAP.md)
- [Domain Model](../DOMAIN_MODEL.md)
- [ADR-002: Routing, Domain, And TLS Boundary](./ADR-002-routing-domain-tls-boundary.md)
- [ADR-004: Server Readiness State Storage](./ADR-004-server-readiness-state-storage.md)
- [ADR-015: Resource Network Profile](./ADR-015-resource-network-profile.md)
- [ADR-019: Edge Proxy Provider And Observable Configuration](./ADR-019-edge-proxy-provider-and-observable-configuration.md)
- [deployments.create Command Spec](../commands/deployments.create.md)
- [resources.create Command Spec](../commands/resources.create.md)
- [default-access-domain-policies.configure Command Spec](../commands/default-access-domain-policies.configure.md)
- [deployments.create Workflow Spec](../workflows/deployments.create.md)
- [Server Bootstrap And Proxy Workflow Spec](../workflows/server-bootstrap-and-proxy.md)
- [Routing Domain And TLS Workflow Spec](../workflows/routing-domain-and-tls.md)
- [Default Access Domain And Proxy Routing Workflow Spec](../workflows/default-access-domain-and-proxy-routing.md)
- [Edge Proxy Provider And Route Realization Workflow Spec](../workflows/edge-proxy-provider-and-route-realization.md)
- [Resource Access Failure Diagnostics Workflow Spec](../workflows/resource-access-failure-diagnostics.md)
- [resources.proxy-configuration.preview Query Spec](../queries/resources.proxy-configuration.preview.md)
- [Default Access Domain And Proxy Routing Test Matrix](../testing/default-access-domain-and-proxy-routing-test-matrix.md)
- [Edge Proxy Provider And Route Configuration Test Matrix](../testing/edge-proxy-provider-and-route-configuration-test-matrix.md)
- [Default Access Domain And Proxy Routing Implementation Plan](../implementation/default-access-domain-and-proxy-routing-plan.md)

## Consequences

Generated default access becomes a configurable platform capability instead of a deployment command option.

The v1 first-deploy loop can show a usable public URL when:

- the selected server has a public address usable by the configured provider;
- edge proxy is installed and ready;
- the resource has `networkProfile.internalPort`;
- route realization succeeds during deployment execution.

Installations that do not want generated default domains can disable the policy without changing command schemas.

Provider-specific generated domains can be replaced without changing core/application code or local command specs.

Concrete generated-domain provider implementations belong under:

```text
packages/providers/default-access-domain-*
```

Examples include a disabled provider, an IP-embedded DNS provider, and a custom-template provider. Application and core packages must depend only on the provider-neutral port.

Concrete edge proxy provider implementations are governed separately by [ADR-019](./ADR-019-edge-proxy-provider-and-observable-configuration.md) and live under:

```text
packages/providers/edge-proxy-*
```

## Superseded Open Questions

- Should generated public access domains be deployment input, domain binding state, or platform policy?
- Should the concrete generated-domain service be known by core/application?
- Does reverse-proxy exposure require publishing each application port on the SSH server?
- Is edge proxy a standalone aggregate root for v1?
- Should proxy route configuration happen only once at server bootstrap or on every deployment?
- Should default access policy be static config or a public command?
- Should the first generated URL read model be deployment-scoped or resource-scoped?
- Where should concrete generated-domain provider packages live?

## Current Implementation Notes And Migration Gaps

Runtime adapters can generate concrete proxy labels and bootstrap edge proxy containers when runtime plans contain access routes. ADR-019 replaces this as the target architecture with edge proxy provider packages and provider-produced plans.

The provider-neutral default access domain port exists in application code, with a concrete generated-domain provider package registered from the shell composition root.

`deployments.create` remains ids-only. Resource network/access context is copied into runtime planning from the resource profile, and generated route metadata is written into deployment runtime-plan snapshots.

`ResourceAccessSummary` exists as the first resource-scoped read-model surface for generated access URLs. It now separates pre-deployment planned generated routes from post-deployment realized generated routes. The Web resource detail page displays this separately from durable domain bindings, and Quick Deploy can show the same generated URL after refreshing the resource read model.

Runtime access-route resolution still contains adapter-facing fields such as `domains`, `proxyKind`, `pathPrefix`, and `tlsMode`. Those fields are now produced by route resolution rather than transport input, but they remain a migration seam until route snapshots are represented by a first-class provider-neutral type.

No read-only full proxy configuration view exists yet beyond generated access URL/status read models.

Current server bootstrap starts proxy bootstrap from the registration event path rather than the canonical `server-connected -> proxy-bootstrap-requested` chain.

The future `default-access-domain-policies.configure` command is not implemented. Static shell configuration remains the temporary provider-selection seam.

Durable domain binding precedence over generated routes has not yet been wired into the default access route resolver.

## Open Questions

- None for default access domain policy command boundary, provider package location, or first generated URL read model placement.
