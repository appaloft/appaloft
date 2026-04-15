# proxy-bootstrap-requested Event Spec

## Normative Contract

`proxy-bootstrap-requested` means the system has requested edge proxy installation or verification for a connected server.

It is a request event. It does not mean the proxy was installed successfully.

Generated default access routes depend on this workflow when the selected resource uses reverse-proxy exposure.

## Event Type

Application orchestration event.

## Trigger

Publish after:

1. `server-connected` exists for the server;
2. server edge proxy provider is required and registered;
3. no ready proxy state already satisfies the request;
4. a new proxy bootstrap attempt id is allocated.

Do not publish this event for disabled/no-proxy targets.

## Publisher

Publisher: server bootstrap process manager.

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

Worker crashes before terminal status must leave a retryable async-processing state visible to operators.

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

## Open Questions

- Should proxy bootstrap attempt ids be persisted on the server aggregate or in a separate process table?
