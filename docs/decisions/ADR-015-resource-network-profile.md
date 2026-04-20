# ADR-015: Resource Network Profile

Status: Accepted

Date: 2026-04-14

## Decision

Resource-owned network configuration is a first-class durable domain concept.

The platform must model a `ResourceNetworkProfile` value object owned by `Resource`. A deployment attempt must consume that profile and persist only the resolved network portion of its runtime plan snapshot.

The target domain vocabulary is:

- `ResourceNetworkProfile`: durable reusable network endpoint configuration owned by a resource.
- `InternalPort`: the port the workload listens on inside the runtime environment or container network.
- `UpstreamProtocol`: the protocol the platform proxy/runtime uses when connecting to the workload endpoint.
- `ExposureMode`: whether the resource has no inbound exposure, reverse-proxy exposure, or explicit direct-port exposure.
- `ResolvedNetworkSnapshot`: the immutable network endpoint plan copied onto a deployment attempt after admission.

`port` by itself is not a sufficient domain term. New specs and code must use `internalPort` when referring to the resource-owned application listener port. Transport/UI fields may display this as "port", but they must map it to `ResourceNetworkProfile.internalPort` before command dispatch.

The minimum v1 `ResourceNetworkProfile` is:

```ts
type ResourceNetworkProfile = {
  internalPort: PortNumber;
  upstreamProtocol: "http" | "tcp";
  exposureMode: "none" | "reverse-proxy" | "direct-port";
  targetServiceName?: string;
  hostPort?: PortNumber;
};
```

Core aggregate state must represent this profile as value objects, including `PortNumber` for
`internalPort` and `hostPort`, a constrained upstream protocol value, a constrained exposure-mode
value, and a resource service name value for `targetServiceName`. Repositories and transports may
serialize to primitives only at their boundaries.

The default for HTTP application resources is:

```ts
{
  upstreamProtocol: "http",
  exposureMode: "reverse-proxy"
}
```

`internalPort` is scoped to one workload runtime environment. Multiple resources on the same
deployment target may use the same `internalPort` when they are isolated by container, process,
service, or runtime network boundaries.

`hostPort` is valid only when `exposureMode = "direct-port"`. Reverse-proxy exposure must not
require a stable host-published port because the proxy targets the destination-local workload
endpoint through the runtime adapter. Runtime adapters may create a loopback-only or otherwise
private ephemeral host-port mapping for local health checks, but that mapping is diagnostic runtime
metadata, not public access state and not a deployment command input.

Web, CLI, API, automation, and future MCP entrypoints must treat `internalPort` as part of the core user-configurable resource creation/configuration chain for inbound application resources. They must not defer this field or require a separate product decision each time an entrypoint is implemented.

## Context

Resource profile work has already moved reusable source and runtime defaults away from deployment admission. `deployments.create` is ids-only and consumes resource-owned profile state.

The remaining ambiguity is that the resource-owned listener port is currently described as a runtime-profile field. That makes it unclear whether the port is:

- a build/start runtime hint;
- a reverse-proxy upstream target;
- a host-published server port;
- a deployment attempt override;
- a durable resource capability.

The v1 deployment loop needs a durable answer before reverse proxy, domain binding, health checks, and redeploy can be reliable.

## Options Considered

### Option A: Keep Port On `deployments.create`

This option is rejected because deployment admission does not own reusable resource configuration. It would keep first-deploy input collection mixed with every deployment attempt.

### Option B: Keep Port Only Inside `ResourceRuntimeProfile`

This option is rejected as the final vocabulary because `runtimeProfile.port` hides network semantics behind a generic runtime field. It does not distinguish the internal workload listener from host publication or proxy routing.

### Option C: Introduce `ResourceNetworkProfile` Owned By `Resource`

This option is accepted.

`ResourceRuntimeProfile` continues to own planning strategy and reusable command defaults. `ResourceNetworkProfile` owns the workload endpoint that deployment planning, runtime adapters, health policy, and domain/proxy binding can target.

## Chosen Rule

`Resource` owns:

```text
Resource
  -> ResourceSourceBinding
  -> ResourceRuntimeProfile
  -> ResourceNetworkProfile
  -> ResourceAccessProfile or DomainBinding references
```

`Deployment` owns:

```text
DeploymentAttempt
  -> RuntimePlanSnapshot
  -> ResolvedNetworkSnapshot
```

For HTTP `application`, `api`, and service-style resources with inbound traffic, `internalPort` must be available before deployment admission. It may be supplied by the entry workflow, persisted by `resources.create`, or inferred by a planner only when the inference is deterministic and persisted before `deployments.create` accepts the attempt.

If an inbound resource requires a network endpoint and `internalPort` cannot be supplied or inferred, admission must fail with:

```ts
{
  code: "validation_error",
  category: "validation",
  phase: "resource-network-resolution",
  retriable: false
}
```

Workers, background jobs, databases, caches, and external resources may use `exposureMode = "none"` when they do not accept inbound public HTTP traffic.

For `compose-stack`, `targetServiceName` is required when the stack has more than one service that could receive inbound traffic. A future compose-service profile may replace this field, but the first v1 rule must not leave the proxy upstream ambiguous.

Generated default access, domain binding, and certificate lifecycle remain separate concerns governed by ADR-017 and ADR-002. `ResourceNetworkProfile` does not own public domain names, generated-domain provider settings, path prefixes, certificate policy, or TLS issuance state. It only defines the resource endpoint that those later workflows can route to.

Health policy remains a distinct resource/runtime concern. When a health check targets the default HTTP endpoint, it must use `ResourceNetworkProfile.internalPort` as the default network target unless the future health-policy command overrides it explicitly.

Reverse-proxy upstream mapping must use `ResourceNetworkProfile.internalPort` as the default upstream port. For runtime adapters that need explicit port mapping, the adapter must derive the mapping from the resolved network snapshot instead of reading deployment command input.

Reverse-proxy runtime cleanup must be scoped by resource/workload identity, not by `internalPort`
or a published host-port lookup. A new terminal deployment attempt for one resource may replace the
previous runtime instance for that same resource, but it must not stop another resource only because
both resources listen on the same `internalPort`.

Direct-port publication is a host placement concern. If two resources request the same effective
host port on the same deployment target/destination, the later attempt must fail or be rejected with
a structured conflict/runtime failure; it must not remove the other resource's runtime instance to
free the port.

`deployments.create` must not accept `internalPort`, `port`, `hostPort`, `exposureMode`, `upstreamProtocol`, `domain`, `pathPrefix`, `proxyKind`, or `tlsMode` as public input. It must resolve the network snapshot from resource state.

## Consequences

The resource domain model separates:

- source binding: where the deployable artifact/source comes from;
- runtime profile: how the source is planned, built, and started;
- network profile: which workload endpoint can be reached;
- access/domain/TLS lifecycle: how users reach that endpoint from public routes;
- deployment snapshot: what one accepted attempt actually used.

Quick Deploy and dedicated resource creation/configuration surfaces must collect the resource port as resource network input, not as deployment input.

Runtime adapters can generate reverse-proxy upstream targets from resource/deployment network snapshots without depending on one-off deployment command fields.

Direct host publication remains explicit. It must not become the default path for HTTP application exposure.

Same-port application deployments are valid under reverse-proxy exposure. The collision boundary is
the public host port for `direct-port`, not the resource `internalPort`.

The v1 user-facing path must expose `internalPort`. It may keep `direct-port` and `hostPort` out of Web/CLI until the direct host-port exposure behavior is implemented as an explicit resource network configuration path.

## Governed Specs

- [resources.create Command Spec](../commands/resources.create.md)
- [deployments.create Command Spec](../commands/deployments.create.md)
- [deployments.create Workflow Spec](../workflows/deployments.create.md)
- [deployments.create Test Matrix](../testing/deployments.create-test-matrix.md)
- [Quick Deploy Workflow Spec](../workflows/quick-deploy.md)
- [Resource Create And First Deploy Workflow Spec](../workflows/resources.create-and-first-deploy.md)
- [Resource Profile Lifecycle Workflow Spec](../workflows/resource-profile-lifecycle.md)
- [resources.configure-network Command Spec](../commands/resources.configure-network.md)
- [resources.create Test Matrix](../testing/resources.create-test-matrix.md)
- [Resource Profile Lifecycle Test Matrix](../testing/resource-profile-lifecycle-test-matrix.md)
- [Default Access Domain And Proxy Routing Test Matrix](../testing/default-access-domain-and-proxy-routing-test-matrix.md)
- [Quick Deploy Test Matrix](../testing/quick-deploy-test-matrix.md)
- [resources.create Implementation Plan](../implementation/resources.create-plan.md)
- [Resource Profile Lifecycle Implementation Plan](../implementation/resource-profile-lifecycle-plan.md)
- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](./ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-014: Deployment Admission Uses Resource Profile](./ADR-014-deployment-admission-uses-resource-profile.md)
- [ADR-017: Default Access Domain And Proxy Routing](./ADR-017-default-access-domain-and-proxy-routing.md)
- [Domain Model](../DOMAIN_MODEL.md)

## Superseded Open Questions

- Should the application listener port belong to `deployments.create`, `ResourceRuntimeProfile`, or a separate resource-owned network profile?
- Is the server-facing published port the same concept as the internal workload listener port?
- How should reverse-proxy target resolution know which port a resource listens on?

## Current Implementation Notes And Migration Gaps

Current code persists and reads `networkProfile.internalPort` as the canonical command, contract, domain, read-model, Web, CLI, and deployment-planning field.

Current deployment admission has removed public deployment override fields and reads only resource network profile state for listener port resolution.

Current `resources.create` accepts `networkProfile.internalPort` as the canonical command, contract, domain, read-model, Web, CLI, and deployment-planning field. It does not accept `runtimeProfile.port`.

Runtime adapters isolate reverse-proxy resources by resource/workload identity and may use
loopback-only ephemeral host-port mappings for health checks while keeping `internalPort` as the
proxy upstream target.

`resources.configure-network` is accepted as the explicit resource network configuration command.
It is not implemented as a user-facing Web/CLI/API configuration surface yet.

Direct host publication remains blocked until `resources.configure-network` also implements the
explicit direct-port placement guards, adapter behavior, and tests required by this ADR.

## Open Questions

- None for the `internalPort` baseline. Direct host-port exposure remains future behavior and must be implemented through an explicit resource network configuration path before it becomes user-facing.
