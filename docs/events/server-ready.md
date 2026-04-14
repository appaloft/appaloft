# server-ready Event Spec

## Normative Contract

`server-ready` means a registered server satisfies the platform's current readiness gates and can accept deployments according to its proxy policy.

It does not mean every future deployment on that server will succeed.

## Event Type

Domain lifecycle event for server readiness, published as an application event through the application layer or outbox.

## Trigger

Publish after one of these paths:

```text
server-connected
  -> server-ready
```

when `proxyKind = none`, or:

```text
server-connected
  -> proxy-bootstrap-requested
  -> proxy-installed
  -> server-ready
```

when `proxyKind = traefik | caddy`.

## Publisher

Publisher: server bootstrap process manager after verifying all readiness gates and persisting ready state.

## Consumers

Expected consumers:

- server read-model projection;
- deployment admission/readiness checks;
- Web/CLI notification;
- audit/observability.

## Payload

```ts
type ServerReadyPayload = {
  serverId: string;
  providerKey: string;
  host: string;
  port: number;
  readyAt: string;
  proxyKind: "none" | "traefik" | "caddy";
  edgeProxyStatus: "disabled" | "ready";
  connectivityAttemptId?: string;
  proxyBootstrapAttemptId?: string;
  correlationId?: string;
  causationId?: string;
};
```

Payload must not include secrets or raw credential material.

## Readiness Definition

A server is ready only when:

- server metadata is registered;
- provider connectivity requirements are satisfied;
- required credentials are usable;
- `proxyKind = none` maps to `edgeProxy.status = disabled`; or
- `proxyKind = traefik | caddy` maps to `edgeProxy.status = ready`.

If proxy bootstrap fails, the server is not ready for proxy-backed deployments.

## Idempotency

Consumers must dedupe by exact event id when available, otherwise by `(serverId, "server-ready", readinessVersion)`.

Duplicate `server-ready` must not duplicate notifications or readiness side effects.

## Ordering

`server-ready` must follow `server-connected`.

If proxy bootstrap is required, it must also follow `proxy-installed`.

It must not follow `proxy-install-failed` for the same proxy bootstrap attempt unless a later successful attempt occurs.

## Retry And Failure Handling

`server-ready` has no retry semantics by itself. Retry belongs to the failed upstream phase:

- connectivity retry for connect failures;
- proxy bootstrap retry for proxy failures.

Consumer failure must be tracked as event-processing failure, not server readiness failure.

## Observability

Logs and traces must include:

- `serverId`;
- `providerKey`;
- `proxyKind`;
- `edgeProxyStatus`;
- `phase = server-ready`;
- `correlationId`;
- `causationId`.

## Current Implementation Notes And Migration Gaps

Current code has no first-class `server-ready` event or top-level server readiness state.

Current read models expose edge proxy kind/status fields, which can support a derived readiness view, but connectivity status is not persisted as part of server lifecycle.

## Open Questions

- Should server readiness be stored on the aggregate or derived by the read model from connectivity/proxy state?
- Should readiness expire after a time window and require periodic revalidation?
