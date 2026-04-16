# Edge Proxy Provider And Route Configuration Implementation Plan

## Normative Contract

This implementation plan introduces a provider-neutral edge proxy boundary and a read-only proxy configuration query without changing the domain ownership model.

The minimal deliverable is:

```text
EdgeProxyProvider port/registry
  -> concrete edge proxy provider packages
  -> server bootstrap uses provider ensure plan
  -> deployment route realization uses provider route and reload plans
  -> resources.proxy-configuration.preview renders read-only config
  -> Web/API/CLI observe provider-rendered config from the query
```

## Governed ADRs

- [ADR-019: Edge Proxy Provider And Observable Configuration](../decisions/ADR-019-edge-proxy-provider-and-observable-configuration.md)
- [ADR-017: Default Access Domain And Proxy Routing](../decisions/ADR-017-default-access-domain-and-proxy-routing.md)
- [ADR-004: Server Readiness State Storage](../decisions/ADR-004-server-readiness-state-storage.md)
- [ADR-015: Resource Network Profile](../decisions/ADR-015-resource-network-profile.md)

## Governed Specs

- [Edge Proxy Provider And Route Realization Workflow](../workflows/edge-proxy-provider-and-route-realization.md)
- [resources.proxy-configuration.preview Query Spec](../queries/resources.proxy-configuration.preview.md)
- [Default Access Domain And Proxy Routing Workflow](../workflows/default-access-domain-and-proxy-routing.md)
- [Server Bootstrap And Proxy Workflow](../workflows/server-bootstrap-and-proxy.md)
- [Default Access Domain And Proxy Routing Test Matrix](../testing/default-access-domain-and-proxy-routing-test-matrix.md)
- [Edge Proxy Provider And Route Configuration Test Matrix](../testing/edge-proxy-provider-and-route-configuration-test-matrix.md)

## Touched Modules And Packages

Expected implementation areas:

- `packages/application/src/ports.ts`: add edge proxy provider, provider registry, provider plans, and proxy configuration view types.
- `packages/application/src/tokens.ts`: add DI token(s) for edge proxy provider registry/query service.
- `packages/application/src/operations/resources`: add the `resources.proxy-configuration.preview` query slice when promoted to active operation.
- `packages/providers/edge-proxy-*`: add concrete provider packages.
- `packages/adapters/runtime`: execute provider-produced plans and reload steps instead of generating concrete proxy config or reload commands through switches.
- `packages/persistence/pg`: project route realization and resource access/configuration read-model state as needed.
- `packages/contracts`: expose provider-neutral query schema and view types when the query becomes active.
- `packages/adapters/cli`: display query output without local provider-specific rendering.
- `apps/web`: show the read-only proxy configuration view on resource detail.
- `apps/shell`: register concrete provider packages and provider registry in the composition root.

## Expected Ports And Adapters

Application-facing provider concepts:

```ts
interface EdgeProxyProviderRegistry {
  resolve(key: string): Result<EdgeProxyProvider, DomainError>;
  defaultFor(input: EdgeProxyProviderSelectionInput): Result<EdgeProxyProvider, DomainError>;
}
```

```ts
interface EdgeProxyProvider {
  key: string;
  capabilities: EdgeProxyProviderCapabilities;
  ensureProxy(...): Promise<Result<EdgeProxyEnsurePlan, DomainError>>;
  realizeRoutes(...): Promise<Result<ProxyRouteRealizationPlan, DomainError>>;
  reloadProxy(...): Promise<Result<ProxyReloadPlan, DomainError>>;
  renderConfigurationView(...): Promise<Result<ProxyConfigurationView, DomainError>>;
}
```

Runtime adapters execute plans:

```text
provider plan -> local shell executor | ssh executor | future runtime executor
```

Provider packages render plans:

```text
resource/server/route snapshot -> provider-specific commands, labels, files, reload steps, diagnostics
```

## Write-Side State Changes

No new aggregate root is introduced for v1.

Write-side changes are limited to:

- replacing direct proxy-specific route/bootstrap construction with provider-produced plans;
- applying provider-produced reload plans after route/certificate-related proxy configuration
  changes and before public route verification;
- recording route realization status and provider key in deployment snapshots/read models where needed;
- recording durable domain binding `not_ready` state when a failed route realization affects active
  custom domain bindings;
- preserving `DeploymentTarget` proxy readiness state as the server bootstrap ownership point.

Provider-rendered configuration sections are query output. They must not become mutable aggregate state.

## Event Publishing Points

Route realization failure for durable domain bindings publishes:

- `domain-route-realization-failed`.

Existing events still govern lifecycle:

- `proxy-bootstrap-requested`;
- `proxy-installed`;
- `proxy-install-failed`;
- `deployment-started`;
- `deployment-succeeded`;
- `deployment-failed`.

If route realization becomes independently retryable, add a new ADR and event specs before implementation.

## Error And neverthrow Boundaries

Provider resolution and provider rendering return `Result` or `Promise<Result<...>>` with structured errors.

Canonical new or reused phases:

- `proxy-provider-resolution`;
- `proxy-ensure-plan-render`;
- `proxy-route-plan-render`;
- `proxy-configuration-render`;
- `proxy-route-realization`;
- `proxy-reload`;
- `proxy-bootstrap`.

No provider-specific error code should mention a concrete proxy product. Provider-specific details may appear in `details.providerKey`, logs, diagnostics, and safe metadata.

## Required Tests

Minimum tests:

- provider registry resolves configured provider and returns structured error for missing provider;
- application code does not import concrete edge proxy provider packages;
- provider contract renders ensure plan, route realization plan, and configuration view from provider-neutral inputs;
- provider contract renders reload behavior as `automatic` or command steps;
- server bootstrap uses provider ensure plan;
- deployment route realization uses provider route and reload plans;
- failed route realization marks affected active domain bindings `not_ready` with safe failure
  metadata and publishes `domain-route-realization-failed`;
- `resources.proxy-configuration.preview` returns planned/latest/deployment-snapshot views without side effects;
- Web/API/CLI display query output instead of generating provider-specific config locally;
- no runtime direct switch is used as the authoritative provider selection mechanism after migration.

## Minimal Deliverable

The minimal deliverable is complete when:

1. concrete edge proxy behavior is behind provider packages;
2. application/server bootstrap and deployment route realization use provider-neutral ports;
3. runtime adapters execute provider-produced plans and reload steps;
4. resource detail can show read-only proxy configuration from a query;
5. CLI/API can fetch the same query output or have an accepted migration gap;
6. tests prove provider contract, query behavior, and one user-facing observation path.

## Migration Seams / Legacy Edges

Runtime proxy bootstrap and label-generation helpers have been replaced by provider-produced plans in the active execution path.

Existing `proxyKind` fields may remain as provider-selection compatibility data until replaced by opaque provider keys and capability records.

Existing generated access route read models are reused as route inputs for configuration preview. They do not yet form a dedicated provider route projection.

The active public query is registered in `CORE_OPERATIONS.md`, `operation-catalog.ts`, API/oRPC, CLI, and Web resource detail.

Durable domain route failure state is now owned by the domain binding route readiness process
manager. Provider/runtime failures still originate in deployment execution, but affected bindings
are persisted as `not_ready` for operator-facing status.

## Open Questions

- None for the minimal provider-interface migration path.
