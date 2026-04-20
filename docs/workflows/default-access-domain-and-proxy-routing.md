# Default Access Domain And Proxy Routing Workflow Spec

## Normative Contract

Default access domain and proxy routing is a provider-neutral workflow for giving an inbound resource a usable public URL when explicit custom domain binding has not been configured.

The workflow is not a public command in v1. It is an internal route-resolution and runtime-realization workflow governed by [ADR-017](../decisions/ADR-017-default-access-domain-and-proxy-routing.md).

```text
resource has networkProfile.internalPort
  -> deployment target has proxy intent and readiness
  -> default access domain policy resolves provider
  -> resource access summary can expose a planned generated hostname
  -> deployments.create resolves route snapshot
  -> edge proxy provider renders route realization plan
  -> runtime adapter executes provider-produced route config
  -> resource access summary exposes the latest realized generated access URL
```

## Global References

This workflow inherits:

- [ADR-017: Default Access Domain And Proxy Routing](../decisions/ADR-017-default-access-domain-and-proxy-routing.md)
- [ADR-019: Edge Proxy Provider And Observable Configuration](../decisions/ADR-019-edge-proxy-provider-and-observable-configuration.md)
- [ADR-024: Pure CLI SSH State And Server-Applied Domains](../decisions/ADR-024-pure-cli-ssh-state-and-server-applied-domains.md)
- [default-access-domain-policies.configure Command Spec](../commands/default-access-domain-policies.configure.md)
- [ADR-014: Deployment Admission Uses Resource Profile](../decisions/ADR-014-deployment-admission-uses-resource-profile.md)
- [ADR-015: Resource Network Profile](../decisions/ADR-015-resource-network-profile.md)
- [ADR-004: Server Readiness State Storage](../decisions/ADR-004-server-readiness-state-storage.md)
- [Routing, Domain, And TLS Boundary](../decisions/ADR-002-routing-domain-tls-boundary.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)
- [Edge Proxy Provider And Route Realization Workflow](./edge-proxy-provider-and-route-realization.md)
- [Resource Access Failure Diagnostics Workflow](./resource-access-failure-diagnostics.md)

## Workflow Position

Default access routing sits between resource network configuration and deployment runtime execution.

It consumes existing state:

- `ResourceNetworkProfile`;
- deployment target/server public address and edge proxy readiness;
- default access domain policy;
- durable domain bindings when present;
- server-applied config domain route state in pure CLI/SSH mode when present;
- deployment attempt id and runtime plan snapshot context.

It produces deployment/resource access snapshots and edge-proxy provider route realization input. It does not create projects, environments, resources, servers, domain bindings, or certificates.

## End-To-End Workflow

```text
resources.create or resource profile update
  -> resource owns internalPort and reverse-proxy exposure mode
  -> servers.register/connect/bootstrap-proxy establishes proxy readiness
  -> resource access summary may expose plannedGeneratedAccessRoute before first deployment
  -> deployments.create admission resolves resource/server/destination context
  -> access route resolver evaluates durable bindings and default access policy
  -> default access domain provider returns generated hostname when policy is enabled
  -> deployment snapshot records generated route metadata
  -> edge proxy provider renders route plan for this deployment
  -> runtime adapter executes provider-produced proxy route config
  -> public route verification runs when configured
  -> resource access summary exposes latestGeneratedAccessRoute and route status
```

If policy is disabled:

```text
resources.create
  -> deployments.create
  -> no generated access route
  -> deployment can still succeed without public default URL
```

If proxy is not ready:

```text
resources.create
  -> deployments.create route resolution requires proxy
  -> reject admission or persist post-acceptance failure based on detection phase
  -> no direct host-port fallback
```

## Provider-Neutral Port

The workflow must use a provider-neutral port. The application boundary may request a generated hostname, but it must not construct provider-specific hostnames itself.

The provider request includes:

| Field | Meaning |
| --- | --- |
| `publicAddress` | Public address or public host for the selected deployment target. |
| `resourceSlug` | Slug-like resource identifier for readable generated hostnames. |
| `resourceId` | Stable resource id for uniqueness and audit. |
| `projectId` | Project context. |
| `environmentId` | Environment context. |
| `serverId` | Deployment target/server context. |
| `destinationId` | Runtime placement context. |
| `deploymentId` | Deployment attempt id only when the configured provider policy explicitly requires a deployment-scoped route. |
| `routePurpose` | `default-resource-access`, `preview-access`, or future explicit purpose. |
| `correlationId` | Observability id. |
| `causationId` | Causation id from command/event. |

The provider response includes:

| Field | Meaning |
| --- | --- |
| `hostname` | Generated public hostname. |
| `scheme` | `http` or `https` hint. |
| `providerKey` | Opaque provider key for audit and read models. |
| `expiresAt` | Optional expiry/refresh metadata. |
| `metadata` | Safe diagnostic metadata only. |

Provider-specific suffixes, DNS algorithms, and naming rules stay inside the provider adapter and configuration.

Generated default access should prefer a stable resource-scoped hostname. Repeated deployments of
the same resource should resolve the same generated hostname when resource, target, destination,
and path policy are unchanged. If a provider requires deployment-scoped hostnames, that scope must
be explicit in the route snapshot and `ResourceAccessSummary`.

Concrete generated-domain providers live under:

```text
packages/providers/default-access-domain-*
```

## Route Precedence

Route resolution must apply this precedence:

1. Durable ready domain binding for the resource/destination/target/path.
2. Durable accepted-but-not-ready domain binding only when the workflow explicitly allows pending-route realization.
3. Server-applied config domain route for pure CLI/SSH mode when present and valid for the selected target.
4. Generated default access route when policy is enabled and no durable binding or server-applied custom route should take precedence.
5. No public route when policy is disabled or route resolution fails with a non-retriable policy result.

Generated routes must not overwrite or remove durable domain bindings or server-applied custom
routes.

## Resource Network Requirements

For reverse-proxy exposure:

- `networkProfile.internalPort` is required;
- `networkProfile.upstreamProtocol` must be supported by the selected edge proxy provider and runtime adapter;
- `networkProfile.exposureMode` must be `reverse-proxy`;
- `hostPort` must not be required;
- the same `internalPort` may be used by multiple resources on the same target because routing is
  scoped by resource/deployment identity and proxy route metadata.

Runtime adapters may allocate a loopback-only or runtime-local ephemeral host port for health
checks, but generated access and edge proxy routing must continue to target the resolved
`internalPort` through the proxy network or equivalent runtime fabric.

For direct-port exposure:

- default generated access routing is not used;
- direct host publication must be implemented through a separate explicit resource network configuration path;
- host-port conflicts must fail or reject the direct-port deployment without stopping another
  resource that already owns the port.

For no inbound exposure:

- no public route is generated;
- deployment may still succeed as a worker/internal resource.

## Server And Proxy Requirements

Generated reverse-proxy routing requires:

- selected deployment target/server exists;
- target has a public address or host usable by the configured provider;
- target edge proxy provider supports reverse-proxy route realization;
- edge proxy is ready or can be idempotently ensured during deployment execution;
- proxy bootstrap failures are represented through server/proxy lifecycle state.

When the selected target has no edge proxy intent, or explicitly disables the edge proxy, generated default access is treated as unavailable for that attempt and deployment planning continues without a generated public URL. This is not a direct-port fallback and must not publish a host port.

The workflow must not silently change a proxy-backed deployment into a public direct-port deployment.

## Deployment Runtime Realization

Route realization is per deployment attempt and idempotent.

The edge proxy provider and runtime adapter together must:

- render and apply route labels/config/manifests using the generated or durable hostname;
- target the resource's resolved internal port;
- attach the workload to the proxy network or equivalent runtime routing fabric;
- scope workload replacement to the deployed resource, not to every workload that exposes the same
  internal port;
- publish public route progress/logs as deployment progress;
- verify the public route when verification is configured;
- record failures with structured error codes and phases.

Runtime execution does not imply that the generated-domain provider was called by the runtime adapter. Generated-domain provider calls belong to the route-resolution boundary before or during runtime plan construction. Edge proxy provider calls belong to the route realization and observable configuration boundary governed by ADR-019.

Gateway-generated request failures for an already exposed route are not route-resolution commands.
They are classified by the resource access failure diagnostics workflow and may feed resource
health/diagnostic summaries as read-only observation evidence.

## User-Facing Entry Behavior

Web, CLI, API, automation, and future MCP entrypoints must treat generated default access as platform policy.

They may display:

- whether generated access is enabled;
- the planned generated public URL after the resource exists and before the first deployment;
- the realized generated public URL after route realization writes a deployment snapshot/read-model projection;
- the read-only generated proxy configuration view when `resources.proxy-configuration.preview` is active;
- route/proxy readiness and failure state;
- instructions to add a custom domain through `domain-bindings.create`.

Generated default access must be labeled as generated or default access. It must not be counted,
listed, or described as a durable domain binding. Custom domain binding lists must show only
`DomainBinding` records created by `domain-bindings.create`.

They must not require users to enter generated-domain provider details during normal resource creation or deployment.

They must not send generated domain, proxy kind, path prefix, or TLS fields to `deployments.create`.

## Public Configuration Command

User-facing policy changes must go through:

```text
default-access-domain-policies.configure
```

The command must configure provider-neutral policy fields such as scope, mode, provider key, template reference, and enablement. It must not expose provider-specific hostname algorithms, DNS suffix internals, or concrete adapter types as domain concepts.

Until the command is active, static installation/server configuration may select a provider for local operation, but Web/CLI/API must not expose policy editing as if it were already a business operation.

## Read Model

The first formal read model surface for generated URLs is resource-scoped:

```text
ResourceAccessSummary
```

`ResourceAccessSummary` is a projection, not aggregate state. It derives from:

- resource network profile and destination/server/proxy state for pre-deployment route planning;
- latest relevant deployment route snapshot;
- domain binding readiness;
- server/proxy readiness;
- provider-neutral route realization status.

`plannedGeneratedAccessRoute` is suitable for resource detail and Quick Deploy review surfaces after a resource record exists. `latestGeneratedAccessRoute` is suitable for completed deployment/readiness surfaces after a deployment attempt resolves and realizes routes.

Deployment detail may also show the immutable route snapshot used by that deployment attempt, but resource detail is the canonical owner-scoped user surface for the current generated access URL.

## Error Semantics

Admission-time route resolution failures return `err(DomainError)` only when the deployment request cannot be safely accepted.

Post-acceptance route realization failures:

- keep the original command result as accepted;
- persist deployment failed or degraded state according to the deployment lifecycle contract;
- preserve server/proxy state;
- expose error code, phase, retriable flag, and route metadata through progress/read models.

Canonical phases:

- `default-access-policy-resolution`;
- `default-access-domain-generation`;
- `proxy-readiness`;
- `route-snapshot-resolution`;
- `proxy-route-realization`;
- `proxy-configuration-render`;
- `public-route-verification`.

## Current Implementation Notes And Migration Gaps

Runtime adapters can materialize proxy routes from runtime-plan access routes and generate concrete proxy labels/config.

ADR-019 defines the target migration: concrete proxy labels/config, ensure plans, logs, diagnostics, and configuration views move behind edge proxy provider packages under `packages/providers/edge-proxy-*`.

The default access provider boundary now exists as an injected application port with a concrete provider under `packages/providers/default-access-domain-*`.

`deployments.create` remains ids-only and route resolution is driven from resource network/access context during runtime planning.

Route inputs still use adapter/deployment-config shaped fields internally after resolution. These fields are no longer transport command input, but they remain a runtime-plan migration seam.

Generated default access route status is separated into a resource-scoped `ResourceAccessSummary` projection. The projection now has a planned pre-deployment route and a latest realized post-deployment route. It is visible through the resource read model/API, resource detail Web page, and Quick Deploy completion feedback when the projection is available.

Durable domain binding precedence is not yet merged into the default access route resolver.

Server-applied config domain precedence from ADR-024 is not yet merged into the route resolver.

The future public `default-access-domain-policies.configure` command is not yet implemented; shell/static configuration selects the current provider.

## Open Questions

- None for first read-model surface or policy configuration command boundary.
