# Default Access Domain And Proxy Routing Implementation Plan

## Normative Contract

This plan implements [ADR-017: Default Access Domain And Proxy Routing](../decisions/ADR-017-default-access-domain-and-proxy-routing.md) and [ADR-019: Edge Proxy Provider And Observable Configuration](../decisions/ADR-019-edge-proxy-provider-and-observable-configuration.md) without adding provider-specific generated-domain or edge-proxy knowledge to core or application domain types.

The minimal deliverable is:

```text
generic default access domain provider port
  -> provider implementation registered in composition root
  -> resource access summary can expose planned generated route before first deployment
  -> route resolver uses resource network profile + server proxy readiness + policy
  -> deployments.create resolves generated access route snapshot
  -> edge proxy provider renders route plan against internalPort
  -> runtime adapter executes provider-produced proxy route plan
  -> resource access summary read model exposes generated URL/status separately from DomainBinding
```

## Governed ADRs

- [ADR-002: Routing, Domain, And TLS Boundary](../decisions/ADR-002-routing-domain-tls-boundary.md)
- [ADR-014: Deployment Admission Uses Resource Profile](../decisions/ADR-014-deployment-admission-uses-resource-profile.md)
- [ADR-015: Resource Network Profile](../decisions/ADR-015-resource-network-profile.md)
- [ADR-017: Default Access Domain And Proxy Routing](../decisions/ADR-017-default-access-domain-and-proxy-routing.md)
- [ADR-019: Edge Proxy Provider And Observable Configuration](../decisions/ADR-019-edge-proxy-provider-and-observable-configuration.md)

## Governed Specs

- [Default Access Domain And Proxy Routing Workflow Spec](../workflows/default-access-domain-and-proxy-routing.md)
- [Default Access Domain And Proxy Routing Test Matrix](../testing/default-access-domain-and-proxy-routing-test-matrix.md)
- [default-access-domain-policies.configure Command Spec](../commands/default-access-domain-policies.configure.md)
- [deployments.create Command Spec](../commands/deployments.create.md)
- [deployments.create Workflow Spec](../workflows/deployments.create.md)
- [Server Bootstrap And Proxy Workflow Spec](../workflows/server-bootstrap-and-proxy.md)
- [Routing Domain And TLS Workflow Spec](../workflows/routing-domain-and-tls.md)
- [Edge Proxy Provider And Route Realization Workflow](../workflows/edge-proxy-provider-and-route-realization.md)
- [resources.proxy-configuration.preview Query Spec](../queries/resources.proxy-configuration.preview.md)

## Touched Modules And Packages

Expected implementation areas:

- `packages/application/src/ports.ts`: add provider-neutral port and route-resolution result types.
- `packages/application/src/tokens.ts`: add DI token for the provider/route resolver.
- `apps/shell/src/register-runtime-dependencies.ts`: register the configured provider implementation.
- `packages/adapters/runtime`: consume provider-produced route/ensure plans and execute them locally or over SSH.
- `packages/providers/default-access-domain-*`: add concrete generated-domain provider implementations.
- `packages/providers/edge-proxy-*`: add concrete edge proxy provider implementations.
- `packages/contracts`: expose provider-neutral generated access route read-model fields.
- `packages/contracts`: expose provider-neutral proxy configuration query fields when the query becomes active.
- `packages/persistence/pg`: persist/read generated access route snapshot metadata and project `ResourceAccessSummary`.
- `apps/web`: display generated URL/status from read models after deployment/resource route resolution.
- `packages/adapters/cli`: print generated URL/status after deploy/read-model observation.

Core packages must not import concrete generated-domain providers.
Core and application packages must not import concrete edge proxy provider packages.

## Expected Ports And Adapters

Application-facing port:

```ts
interface DefaultAccessDomainProvider {
  generate(
    context: ExecutionContext,
    input: DefaultAccessDomainRequest,
  ): Promise<Result<GeneratedAccessDomain, DomainError>>;
}
```

The concrete provider implementation may use a configured IP-embedded DNS provider, wildcard domain provider, custom template provider, or disabled provider. Provider packages live under `packages/providers/default-access-domain-*`. The provider implementation lives outside core/application and is selected in the composition root.

Edge proxy provider-facing port:

```ts
interface EdgeProxyProvider {
  ensureProxy(...): Promise<Result<EdgeProxyEnsurePlan, DomainError>>;
  realizeRoutes(...): Promise<Result<ProxyRouteRealizationPlan, DomainError>>;
  renderConfigurationView(...): Promise<Result<ProxyConfigurationView, DomainError>>;
}
```

Concrete edge proxy provider packages live under `packages/providers/edge-proxy-*` and are selected through dependency injection or a provider registry in the composition root.

## Future Public Command

Policy editing must be exposed through the accepted future command:

```text
default-access-domain-policies.configure
```

The first implementation may read static installation/server configuration while the command is not active, but any Web/CLI/API policy-editing surface must wait for the command spec, operation catalog entry, transport contracts, tests, and read model to exist.

## Write-Side State Changes

Deployment admission/planning must capture:

- route source: `generated-default`, `domain-binding`, or `none`;
- hostname(s);
- opaque provider key;
- scheme hint;
- target internal port;
- proxy kind;
- route realization status when available;
- safe route diagnostic metadata.

Provider-rendered configuration sections are query output and must not become mutable aggregate state.

DomainBinding state must not be mutated for generated default routes.

Server edge proxy state must remain owned by the server/proxy bootstrap workflow.

`ResourceAccessSummary` must project planned and realized generated access URL/status from resource/server/policy state, deployment route snapshots, and related readiness state. This projection must not become `Resource` aggregate state.

`plannedGeneratedAccessRoute` is computed for an already persisted resource before the first deployment attempt. `latestGeneratedAccessRoute` is derived from immutable deployment/runtime-plan snapshots after route resolution and realization.

## Event Publishing Points

No new formal domain event is required for the minimal deliverable.

Deployment progress may report route realization steps. Durable deployment terminal events remain:

- `deployment-requested`;
- `deployment-started`;
- `deployment-succeeded`;
- `deployment-failed`.

If route realization later needs independent retry, introduce a dedicated event/process spec before implementation.

## Error And neverthrow Boundaries

Provider and route resolver failures return structured `DomainError` values through `Result` or `Promise<Result<...>>`.

Required phases:

- `default-access-policy-resolution`;
- `default-access-domain-generation`;
- `proxy-readiness`;
- `route-snapshot-resolution`;
- `proxy-route-realization`;
- `proxy-configuration-render`;
- `public-route-verification`.

Post-acceptance route realization failure must persist deployment failure/degraded state and must not rewrite the original accepted command result.

## Required Tests

Minimum tests:

- provider adapter contract: concrete provider produces expected hostname from provider-neutral input;
- policy command contract: `default-access-domain-policies.configure` persists provider-neutral policy state and does not mutate deployments or domain bindings;
- application route resolver: policy disabled, policy enabled, provider failure, missing public address, durable binding precedence;
- deployment admission: ids-only command resolves generated route from resource/server/policy state;
- runtime adapter: proxy route targets `networkProfile.internalPort` and does not require public host application port;
- runtime adapter: two reverse-proxy resources can use the same `internalPort` without one deployment
  cleaning up the other's runtime instance;
- runtime adapter: a new deployment attempt for the same resource uses resource-scoped replacement
  rather than port-scoped replacement;
- runtime adapter: direct-port host-port collisions fail or reject the conflicting deployment
  without stopping the existing resource runtime;
- edge proxy provider contract: concrete provider renders ensure plan, route realization plan, and configuration view from provider-neutral input;
- proxy configuration query: planned/latest/deployment-snapshot views are read-only and redacted;
- read model: planned generated route is exposed for persisted resources before first deployment, and realized generated route is exposed from deployment snapshots after deployment;
- resource access summary: latest generated URL/status is projected from deployment snapshots and does not mutate Resource aggregate state;
- Web/CLI: generated URL/status is displayed from read model, not from provider-specific local generation.

## Minimal Deliverable

The minimal deliverable is complete when:

1. core/application contain no concrete generated-domain provider names;
2. a provider-neutral port can generate a route hostname through DI;
3. `deployments.create` remains ids-only;
4. reverse-proxy route realization uses `ResourceNetworkProfile.internalPort`;
5. generated route state is visible in `ResourceAccessSummary` before first deployment as a planned route and after deployment as a realized route;
6. read-only proxy configuration can be rendered through `resources.proxy-configuration.preview` when promoted to an active query;
7. tests cover provider boundary, route resolver, runtime adapter, proxy configuration query, and one Web or CLI observation path.

## Migration Seams / Legacy Edges

`DefaultAccessDomainProvider` now exists as a provider-neutral application port, and the first concrete provider is registered from the shell composition root through `packages/providers/default-access-domain-*`.

`deployments.create` now passes resource-owned network/access context to runtime planning while keeping the command input ids-only.

Runtime adapter route hint fields such as `domains`, `proxyKind`, `pathPrefix`, and `tlsMode`
remain an adapter-facing migration seam. They are populated by the default access route resolver
instead of transport command input, but durable domain binding precedence and ADR-024
server-applied config-domain precedence have not yet been wired into the same resolver.

Existing proxy label/config generation is reused behind the route snapshot boundary. Reverse-proxy deployments bind workload ports to loopback for local health and proxy access rather than requiring a stable public host application port.

Reverse-proxy runtime cleanup is resource-scoped. Deployments must not remove all containers or
processes that publish the same application `internalPort`, because same-port resources are valid
under proxy routing.

Existing proxy label/config generation is still runtime-adapter owned. ADR-019 requires wrapping or moving it behind concrete edge proxy provider packages.

`ResourceAccessSummary` is now projected from both persisted resource/server/policy state for pre-deployment planned routes and deployment runtime-plan route snapshots for post-deployment realized routes. It is surfaced through the resource read model/API, the resource detail Web page, and Quick Deploy completion feedback when the projection is available.

Current deployment progress streaming remains the route-realization observation channel. More granular route-realization progress may be added when route realization becomes an independently retryable workflow.

`default-access-domain-policies.configure` is still a future public command. Static shell configuration is the temporary configuration seam.

## Open Questions

- None for provider package location, first read model, or public policy configuration command boundary.
