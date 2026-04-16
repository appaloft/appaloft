# proxy-bootstrap-requested Event Spec

## Normative Contract

`proxy-bootstrap-requested` means the system has requested edge proxy installation or verification for a connected server.

It is a request event. It does not mean the proxy was installed successfully.

Generated default access routes depend on this workflow when the selected resource uses reverse-proxy exposure.

## Event Type

Application orchestration event.

## Trigger

Publish after either the initial post-connect proxy requirement is accepted or an explicit repair/retry
request is accepted through `servers.bootstrap-proxy`.

Initial post-connect publication requires:

1. `server-connected` exists for the server;
2. server edge proxy provider is required and registered;
3. no ready proxy state already satisfies the request;
4. a new proxy bootstrap attempt id is allocated.

Explicit repair/retry publication requires:

1. the server exists and is connected or otherwise operable enough to run provider-owned proxy checks;
2. server edge proxy provider intent can be resolved;
3. a new proxy bootstrap attempt id is allocated;
4. the request is accepted by `servers.bootstrap-proxy`.

Do not publish this event for disabled/no-proxy targets.

## Publisher

Publisher: server bootstrap process manager or `servers.bootstrap-proxy` application use case after
durable attempt state is recorded.

## Consumers

Expected consumers:

- proxy bootstrap worker;
- runtime adapter boundary;
- server read-model projection;
- event monitoring.

## Payload

```ts
type ProxyBootstrapRequestedPayload = {
  serverId: string;
  edgeProxyProviderKey: string;
  attemptId: string;
  requestedAt: string;
  providerKey: string;
  host: string;
  port: number;
  reason: "post-connect" | "repair" | "retry" | "doctor-follow-up";
  correlationId?: string;
  causationId?: string;
};
```

Payload must not contain private keys or raw secret material.

## State Progression

Required state progression:

```text
connected -> proxy_bootstrapping
edgeProxy.status: pending|failed -> starting
```

If the proxy is already ready for the same server/provider key, duplicate handling must be a no-op.
An explicit repair/retry may still record a new verification attempt when the operator requests repair
after diagnostics, but it must not erase previous failed attempt history.

## Follow-Up Actions

Successful handling publishes `proxy-installed`.

Failed handling publishes `proxy-install-failed`.

## Idempotency

Consumers must dedupe by `(serverId, edgeProxyProviderKey, attemptId)`.

Duplicate event consumption must not run duplicate bootstrap commands for an already completed attempt.

## Ordering

`proxy-bootstrap-requested` must occur after `server-connected` and before `proxy-installed` or `proxy-install-failed` for the same attempt id.

## Retry And Failure Handling

Retry must be a new explicit proxy bootstrap attempt with a new `attemptId`. It must not be raw replay of an old `proxy-bootstrap-requested` event.

The accepted public retry/repair command is `servers.bootstrap-proxy`, exposed through
`yundu server proxy repair <serverId>` and `POST /api/servers/{serverId}/edge-proxy/bootstrap`.

Worker crashes before terminal status must leave a retryable async-processing state visible to operators.

Repair handling may verify, restart, recreate, or upgrade only provider-owned proxy infrastructure
and provider-owned networks/volumes. It must not remove, restart, or mutate user workload containers.

## Observability

Logs and traces must include:

- `serverId`;
- `edgeProxyProviderKey`;
- `attemptId`;
- `phase = proxy-bootstrap`;
- `correlationId`;
- `causationId`.

## Current Implementation Notes And Migration Gaps

Current code does not publish `proxy-bootstrap-requested`. Current proxy bootstrap starts from `deployment_target.registered`.

Current edge proxy state can move from `pending` to `starting` through `beginEdgeProxyBootstrap`, but there is no explicit attempt id.

Current runtime state still exposes `proxyKind`; ADR-019 treats that as provider-selection migration data. The target event payload uses `edgeProxyProviderKey`.

Current public `servers.bootstrap-proxy` CLI and HTTP/oRPC entrypoints publish
`proxy-bootstrap-requested` with a generated `pxy_*` attempt id. Registration-triggered bootstrap
still starts from the legacy `deployment_target.registered` event and needs migration to the same
canonical request event path.

## Open Questions

- None. ADR-004 allows the active implementation to keep aggregate/read-model readiness summary while the durable attempt store is introduced; historical attempt storage is part of the implementation plan.
