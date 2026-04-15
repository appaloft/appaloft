# ADR-019: Edge Proxy Provider And Observable Configuration

Status: Accepted

Date: 2026-04-15

## Decision

Yundu must model edge proxy behavior through provider-neutral application ports and expose generated proxy configuration through a read/query surface.

Core and application code must not branch on concrete edge proxy implementations such as a specific reverse-proxy product. They may depend only on provider-neutral concepts:

- `EdgeProxyProvider`;
- `EdgeProxyProviderRegistry`;
- `EdgeProxyEnsurePlan`;
- `ProxyRouteRealizationPlan`;
- `ProxyConfigurationView`.

Concrete edge proxy providers own provider-specific decisions:

- how the shared proxy is installed or ensured on a deployment target;
- whether route realization is expressed as Docker labels, config files, commands, provider API calls, or runtime manifests;
- how logs, health checks, diagnostics, and generated configuration sections are collected;
- how resource routes target destination-local workloads.

The first concrete provider packages must live under:

```text
packages/providers/edge-proxy-*
```

The composition root selects and registers provider implementations. Application services, command handlers, query handlers, process managers, Web transports, CLI transports, and runtime orchestration must use the registered provider interface or provider registry instead of hardcoded implementation switches.

## Context

Generated default access routes and durable domain bindings require an edge proxy for reverse-proxy resources. Operators also need to inspect the generated proxy configuration that will be or has been applied for a resource route.

The source-of-truth model needs two separate but connected boundaries:

1. Provider-neutral route intent and route snapshots owned by Yundu workflows.
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

### Observable Proxy Configuration

Yundu must expose read-only resource-scoped proxy configuration through:

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

### State Ownership

Edge proxy is not a standalone aggregate root in v1.

The v1 ownership model is:

| Concern | Owner |
| --- | --- |
| Proxy intent and readiness summary | `DeploymentTarget` aggregate/read model |
| Proxy bootstrap attempts | Server bootstrap/process workflow state |
| Resource upstream endpoint | `ResourceNetworkProfile` |
| Generated access hostname | Default access domain provider and route snapshot |
| Per-deployment route realization snapshot | Deployment/runtime plan snapshot |
| Provider-rendered visible config | Query/read model derived from provider output and snapshots |

Provider-rendered configuration view is not persisted as mutable domain state unless a future ADR introduces a separate audited proxy route aggregate or configuration override command.

## Consequences

Provider-specific proxy code becomes replaceable without changing command schemas or core aggregate language.

Resource detail, API, and CLI can show what proxy configuration Yundu intends to apply or has applied. This reduces black-box runtime behavior and gives operators a stable debugging surface.

Existing route realization and proxy bootstrap code must move behind concrete provider packages. Runtime adapters should become executors of provider-produced plans rather than authors of proxy-specific config.

Future user-editable proxy overrides require a separate ADR and command boundary. The v1 query is read-only.

## Governed Specs

- [Business Operation Map](../BUSINESS_OPERATION_MAP.md)
- [Core Operations](../CORE_OPERATIONS.md)
- [Domain Model](../DOMAIN_MODEL.md)
- [ADR-017: Default Access Domain And Proxy Routing](./ADR-017-default-access-domain-and-proxy-routing.md)
- [Default Access Domain And Proxy Routing Workflow](../workflows/default-access-domain-and-proxy-routing.md)
- [Server Bootstrap And Proxy Workflow](../workflows/server-bootstrap-and-proxy.md)
- [Edge Proxy Provider And Route Realization Workflow](../workflows/edge-proxy-provider-and-route-realization.md)
- [resources.proxy-configuration.preview Query Spec](../queries/resources.proxy-configuration.preview.md)
- [Default Access Domain And Proxy Routing Test Matrix](../testing/default-access-domain-and-proxy-routing-test-matrix.md)
- [Edge Proxy Provider And Route Configuration Test Matrix](../testing/edge-proxy-provider-and-route-configuration-test-matrix.md)
- [Edge Proxy Provider And Route Configuration Implementation Plan](../implementation/edge-proxy-provider-and-route-configuration-plan.md)

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

Edge proxy providers currently render Docker bootstrap commands and Docker labels. Provider log collection, health probes, and richer diagnostics remain future provider capabilities.

## Open Questions

- None for the provider boundary, package location, and read-only proxy configuration query.
