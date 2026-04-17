# Server Proxy Bootstrap Repair Implementation Plan

## Normative Contract

`servers.bootstrap-proxy` is the explicit repair and retry operation for provider-owned edge proxy
infrastructure on an existing deployment target.

The minimal deliverable is:

```text
server doctor reports proxy failure
  -> operator or API calls servers.bootstrap-proxy
  -> new proxy bootstrap attempt id is allocated
  -> proxy-bootstrap-requested is published
  -> provider ensure plan verifies or repairs provider-owned proxy infrastructure
  -> proxy-installed | proxy-install-failed is durably recorded
```

Repair is limited to provider-owned proxy containers, networks, volumes, labels, and compatibility
checks. It must not remove, restart, or mutate user workload containers.

## Governed ADRs

- [ADR-003: Server Connect Public Versus Internal](../decisions/ADR-003-server-connect-public-vs-internal.md)
- [ADR-004: Server Readiness State Storage](../decisions/ADR-004-server-readiness-state-storage.md)
- [ADR-017: Default Access Domain And Proxy Routing](../decisions/ADR-017-default-access-domain-and-proxy-routing.md)
- [ADR-019: Edge Proxy Provider And Observable Configuration](../decisions/ADR-019-edge-proxy-provider-and-observable-configuration.md)

No new ADR is required for the minimal repair operation. Existing ADRs already assign proxy
readiness to the server bootstrap lifecycle, require durable readiness state, and place concrete
proxy behavior behind provider packages.

## Governed Specs

- [Server Register Or Connect Command Spec](../commands/servers.register-or-connect.md)
- [Server Bootstrap And Proxy Workflow](../workflows/server-bootstrap-and-proxy.md)
- [Server Bootstrap Error Spec](../errors/server-bootstrap.md)
- [proxy-bootstrap-requested Event Spec](../events/proxy-bootstrap-requested.md)
- [proxy-installed Event Spec](../events/proxy-installed.md)
- [proxy-install-failed Event Spec](../events/proxy-install-failed.md)
- [Server Bootstrap Test Matrix](../testing/server-bootstrap-test-matrix.md)
- [Edge Proxy Provider And Route Realization Workflow](../workflows/edge-proxy-provider-and-route-realization.md)

## Touched Modules And Packages

Expected implementation areas:

- `packages/application/src/operations/servers`: add `BootstrapServerProxyCommand`,
  `BootstrapServerProxyCommandInput`, handler, and use case.
- `packages/application/src/operation-catalog.ts`: register `servers.bootstrap-proxy`.
- `packages/application/src/tokens.ts`: add or reuse explicit DI tokens for the use case and handler.
- `packages/application/src/ports.ts`: keep repair behind the existing edge proxy provider registry
  and runtime execution ports; add attempt-store ports only if aggregate/read-model summary cannot
  safely represent attempt admission.
- `packages/adapters/runtime`: reuse provider-rendered ensure plans for repair and keep runtime
  mutation scoped to provider-owned proxy assets.
- `packages/persistence/pg`: persist active/last proxy attempt metadata or add a dedicated process
  attempt table if needed by ADR-004 readiness queries.
- `packages/contracts` and `packages/orpc`: expose the command schema and
  `POST /api/servers/{serverId}/edge-proxy/bootstrap`.
- `packages/adapters/cli`: add `appaloft server proxy repair <serverId>` and dispatch the command bus.
- `apps/shell`: register use case, handler, provider registry, runtime ports, and worker/process
  manager dependencies through tokens.

## Command Shape

The public command input is:

```ts
type BootstrapServerProxyCommandInput = {
  serverId: string;
  reason?: "repair" | "retry" | "doctor-follow-up";
};
```

Internal process-manager calls may include resolved provider key, attempt id, correlation id, and
causation id. Public CLI/API callers must not supply an attempt id directly; the use case allocates
one through the injected `IdGenerator`.

## Admission Rules

`servers.bootstrap-proxy` accepts when:

- the server exists;
- the server is connected or otherwise operable enough to run provider-owned proxy checks;
- provider-backed proxy intent can be resolved;
- the provider is registered and can render an ensure plan;
- a new attempt id can be persisted before async work is started.

It rejects with `err(DomainError)` for validation, missing server, unsupported provider, or state
that cannot safely accept a repair attempt.

## State, Events, And Errors

Successful admission records a new attempt and publishes `proxy-bootstrap-requested` with
`reason = repair`, `retry`, or `doctor-follow-up`.

Runtime success records `edgeProxy.status = ready`, stores safe runtime metadata, and publishes
`proxy-installed`.

Runtime failure records `edgeProxy.status = failed`, stores safe structured failure details, and
publishes `proxy-install-failed`.

Failure retryability follows [Server Bootstrap Error Spec](../errors/server-bootstrap.md).

## Required Tests

Minimum tests:

- command schema rejects missing or malformed `serverId`;
- command rejects missing server and unsupported provider through structured `DomainError`;
- command accepts a connected or operable server and allocates a new attempt id;
- command publishes `proxy-bootstrap-requested` with `reason = repair` or `doctor-follow-up`;
- repeated repair after a failed attempt creates a new attempt id instead of replaying the old event;
- provider ensure plan execution is scoped to provider-owned proxy assets and does not mutate user
  workload containers;
- successful repair publishes `proxy-installed` and marks edge proxy ready;
- failed repair publishes `proxy-install-failed` with the configured retryability;
- CLI `appaloft server proxy repair <serverId>` dispatches `servers.bootstrap-proxy`;
- HTTP `POST /api/servers/{serverId}/edge-proxy/bootstrap` reuses the command schema;
- server doctor output can point to the repair operation for retriable proxy failures without
  mutating lifecycle state itself.

## Minimal Deliverable

The minimal deliverable is complete when:

1. `servers.bootstrap-proxy` is active in `CORE_OPERATIONS.md`, `operation-catalog.ts`, CLI, and API.
2. Repair creates a new durable attempt and event chain.
3. Provider-owned proxy repair succeeds for the active Traefik provider path.
4. Non-retriable provider/configuration failures stay visible and do not hide behind automatic retry.
5. Tests prove no user workload container is touched by repair.

## Migration Seams / Legacy Edges

The current implementation starts proxy bootstrap from `deployment_target.registered` and records
aggregate events such as `deployment_target.edge_proxy_bootstrap_failed`. The target implementation
should bridge those legacy aggregate events to the canonical `proxy-*` event specs without weakening
the canonical event names.

The current read model exposes edge proxy fields but no dedicated attempt history. For the first
implementation, it is acceptable to store latest attempt summary on the deployment target read model
as long as command admission remains durable and retry allocates a new attempt id. A dedicated
attempt/process table can follow when richer history is needed.

`proxyKind` may remain as provider-selection migration data until all active commands and read
models use provider-neutral `edgeProxyProviderKey`.

## Open Questions

- None for the minimal repair/retry operation.
