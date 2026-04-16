# Edge Proxy Provider And Route Realization Workflow Spec

## Normative Contract

Edge proxy provider and route realization is the internal workflow that turns provider-neutral route intent into provider-specific proxy infrastructure and route configuration.

The workflow is not a public command. It is used by server bootstrap, deployment route realization, generated access routing, durable domain routing, and proxy configuration queries.

```text
deployment target proxy intent
  -> resolve EdgeProxyProvider
  -> ensure shared proxy infrastructure
  -> render route realization plan
  -> runtime adapter executes provider-produced plan
  -> capture route realization snapshot/read model
  -> expose provider-rendered read-only configuration view
```

## Global References

This workflow inherits:

- [ADR-019: Edge Proxy Provider And Observable Configuration](../decisions/ADR-019-edge-proxy-provider-and-observable-configuration.md)
- [ADR-017: Default Access Domain And Proxy Routing](../decisions/ADR-017-default-access-domain-and-proxy-routing.md)
- [ADR-004: Server Readiness State Storage](../decisions/ADR-004-server-readiness-state-storage.md)
- [ADR-015: Resource Network Profile](../decisions/ADR-015-resource-network-profile.md)
- [Default Access Domain And Proxy Routing Workflow](./default-access-domain-and-proxy-routing.md)
- [Server Bootstrap And Proxy Workflow](./server-bootstrap-and-proxy.md)
- [resources.proxy-configuration.preview Query Spec](../queries/resources.proxy-configuration.preview.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Workflow Position

This workflow owns provider coordination. It does not own aggregate invariants.

It consumes:

- deployment target/server proxy intent;
- deployment target public address and runtime access metadata;
- resource network profile;
- generated or durable access route snapshot;
- deployment attempt id;
- provider registry configuration;
- execution context and correlation ids.

It produces:

- proxy ensure plans;
- route realization plans;
- provider-rendered configuration sections;
- progress/log events or deployment progress entries;
- route realization status in read models/snapshots.

## Provider Resolution

Provider resolution must be explicit:

```text
provider key or proxy intent
  -> EdgeProxyProviderRegistry
  -> EdgeProxyProvider
```

Provider keys are opaque. Application code may compare them only for registry lookup and audit/read-model display. It must not branch on provider-specific names to choose label syntax, image names, config file paths, or startup commands.

When no proxy is required, provider resolution returns a no-proxy result and the workflow must not create provider configuration.

## Server Bootstrap Relationship

Server bootstrap uses the same provider interface as deployment route realization.

```text
server-connected
  -> proxy-bootstrap-requested
  -> EdgeProxyProvider.ensureProxy
  -> runtime executor runs provider-produced ensure plan
  -> proxy-installed | proxy-install-failed
```

Explicit proxy repair uses the same provider ensure path:

```text
servers.bootstrap-proxy
  -> proxy-bootstrap-requested(new attemptId)
  -> EdgeProxyProvider.ensureProxy
  -> runtime executor verifies or repairs provider-owned proxy infrastructure
  -> proxy-installed | proxy-install-failed
```

The provider owns the proxy-specific ensure plan. Runtime execution owns how the plan is executed locally or over SSH.
Provider ensure plans may mutate only provider-owned proxy assets and must not mutate user workload
containers.

## Deployment Route Realization

For every accepted deployment attempt with reverse-proxy routes:

1. Resolve route snapshot from resource network profile, default access policy, durable domain bindings, and deployment target state.
2. Resolve edge proxy provider.
3. Ask the provider to render a route realization plan.
4. Execute the provider-produced plan through the runtime adapter.
5. Record progress and final route realization status.
6. Project the result into resource/deployment read models.

The provider must target `ResourceNetworkProfile.internalPort` or the immutable network snapshot derived from it. It must not read deployment command transport fields for port/domain/proxy/TLS behavior.

## Observable Configuration

The provider must support rendering a read-only configuration view for:

- desired planned route state;
- latest realized route state;
- one deployment snapshot.

The configuration view may include provider-specific sections such as:

- container labels;
- config files;
- runtime commands;
- route manifests;
- health/diagnostic commands;
- warnings.

These sections are read-model output. They are not aggregate state and must not be accepted back as command input.

## Idempotency

Proxy ensure is idempotent by:

```text
serverId + providerKey + proxy role
```

Route realization is idempotent by:

```text
deploymentId + routeId + providerKey
```

Configuration preview is idempotent by:

```text
resourceId + routeScope + providerKey + route snapshot version
```

Retry must create a new attempt for mutating async work. It must not replay old fact events as if downstream work had not happened.

## Error Semantics

Canonical phases:

- `proxy-provider-resolution`;
- `proxy-ensure-plan-render`;
- `proxy-bootstrap`;
- `proxy-route-plan-render`;
- `proxy-route-realization`;
- `proxy-configuration-render`;
- `proxy-diagnostics`;
- `public-route-verification`.

Provider errors must return structured `DomainError` values with category, phase, retriable flag, correlation id, causation id, and related server/resource/deployment ids.

Post-acceptance route realization failure must persist deployment failure or degraded route state. It must not rewrite the original accepted command result.

## User-Facing Surfaces

When the query is active, Web resource detail must expose read-only proxy configuration from `resources.proxy-configuration.preview`.

CLI and API must expose the same provider-neutral query result.

Provider-specific configuration must not be generated inside Web components, CLI commands, or HTTP route handlers.

## Current Implementation Notes And Migration Gaps

Runtime proxy bootstrap and route label generation now execute provider-produced plans instead of adapter-owned concrete proxy branches.

Server bootstrap resolves concrete edge proxy behavior through the injected provider registry and a runtime bootstrapper executor.

Deployment execution asks the provider registry for route realization plans and passes the generated labels/network intent to runtime executors.

`resources.proxy-configuration.preview` exists for Web/API/CLI, but provider diagnostics are limited to generated configuration sections and basic metadata.

## Open Questions

- None for v1 provider boundary and read-only configuration visibility.
