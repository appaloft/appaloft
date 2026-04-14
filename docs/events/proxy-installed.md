# proxy-installed Event Spec

## Normative Contract

`proxy-installed` means the required edge proxy for a server is installed, running, and durably recorded as ready for the bootstrap attempt.

It does not mean every deployment routed through the proxy is healthy.

## Event Type

Domain lifecycle event for server edge proxy readiness, published as an application event through the application layer or outbox.

## Trigger

Publish after:

1. a `proxy-bootstrap-requested` attempt exists;
2. the runtime bootstrapper verifies or creates the required network/proxy container;
3. the server edge proxy status is durably recorded as `ready`;
4. the successful attempt metadata is recorded.

## Publisher

Publisher: proxy bootstrap worker/process manager after persisting ready state.

## Consumers

Expected consumers:

- server bootstrap process manager;
- server read-model projection;
- audit/notification;
- deployment admission/readiness checks.

## Payload

```ts
type ProxyInstalledPayload = {
  serverId: string;
  proxyKind: "traefik" | "caddy";
  attemptId: string;
  installedAt: string;
  providerKey: string;
  containerName?: string;
  networkName?: string;
  correlationId?: string;
  causationId?: string;
};
```

## State Progression

Required state progression:

```text
edgeProxy.status: starting -> ready
proxy_bootstrapping -> proxy_ready
```

If connectivity is still valid and no other readiness gates remain, this event should lead to `server-ready`.

## Follow-Up Actions

```text
proxy-installed -> server-ready
```

The follow-up action must be idempotent and must verify that server connectivity is still valid or has not expired according to readiness policy.

## Idempotency

Consumers must dedupe by `(serverId, proxyKind, attemptId)`.

Duplicate `proxy-installed` must not repeatedly mark ready, duplicate notifications, or restart the proxy.

## Ordering

`proxy-installed` must follow `proxy-bootstrap-requested` for the same attempt id.

It is mutually exclusive with `proxy-install-failed` for the same attempt id.

## Retry And Failure Handling

Consumer failure is event-processing failure and must not change proxy status from ready to failed.

If a later verification finds the proxy unhealthy, it must be represented as a new health/readiness event or command, not by rewriting the historical `proxy-installed` event.

## Observability

Logs and traces must include:

- `serverId`;
- `proxyKind`;
- `attemptId`;
- `phase = proxy-bootstrap`;
- `correlationId`;
- `causationId`;
- runtime metadata such as container and network names when safe.

## Current Implementation Notes And Migration Gaps

Current code records `deployment_target.edge_proxy_bootstrap_succeeded` when `markEdgeProxyReady` is called. It stores `edgeProxy.status = ready` and `lastSucceededAt`.

The current event handler marks ready but does not publish pulled aggregate events after the mark. The target canonical event is `proxy-installed`.

## Open Questions

- Should `proxy-installed` include runtime metadata such as image name and exposed ports, or should those remain only in worker logs?
