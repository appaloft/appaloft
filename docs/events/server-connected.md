# server-connected Event Spec

## Normative Contract

`server-connected` means a registered server has passed the platform's provider-specific connectivity requirements and can be operated by the runtime layer.

It does not mean edge proxy bootstrap has completed, and it does not mean the server is ready for proxy-backed deployments.

## Event Type

Domain event for the server/deployment-target lifecycle, published as an application orchestration event through the application layer or outbox.

## Trigger

Publish after:

1. a registered server exists;
2. required credentials for the provider are available and usable;
3. connectivity probes pass the provider readiness policy;
4. connected lifecycle state is durably recorded.

Draft connectivity tests must not publish this event.

## Publisher

Publisher: `servers.connect` use case, connectivity process manager, or server aggregate behavior that records the connected state.

## Consumers

Expected consumers:

- proxy bootstrap process manager;
- server read-model projection;
- audit/notification consumers;
- deployment admission checks that need server readiness.

## Payload

```ts
type ServerConnectedPayload = {
  serverId: string;
  providerKey: string;
  host: string;
  port: number;
  connectedAt: string;
  connectivityStatus: "healthy";
  checkNames: string[];
  correlationId?: string;
  causationId?: string;
};
```

Payload must not include private keys or raw secret material.

## State Progression

Required lifecycle progression:

```text
registered -> connecting -> connected
```

If `proxyKind = none`, this event may allow the process manager to mark the server ready. If `proxyKind = traefik | caddy`, it must trigger proxy bootstrap before `server-ready`.

## Follow-Up Actions

If edge proxy is required:

```text
server-connected -> proxy-bootstrap-requested
```

If edge proxy is disabled:

```text
server-connected -> server-ready
```

## Idempotency

Consumers must dedupe by exact event id when available, otherwise by `(serverId, "server-connected", connectedAt)` or the connectivity attempt id.

Duplicate `server-connected` must not schedule duplicate proxy bootstrap attempts for the same attempt id.

## Ordering

`server-connected` must occur after server registration and before `proxy-bootstrap-requested` or `server-ready`.

## Retry And Failure Handling

Connectivity failure must not publish `server-connected`. It must be recorded as a server bootstrap error with `phase = connect`.

Retrying connectivity must use a new connectivity attempt id or explicit retry command. Raw event replay must not be the retry mechanism.

## Observability

Logs and traces must include:

- `serverId`;
- `providerKey`;
- `phase = connect`;
- `attemptId`;
- `correlationId`;
- `causationId`;
- check names and aggregate status.

## Current Implementation Notes And Migration Gaps

Current code has `servers.test-connectivity` and `servers.test-draft-connectivity`, but no durable `server-connected` event or top-level connected lifecycle state.

Current connectivity result values are `healthy`, `degraded`, and `unreachable`. The target lifecycle event should only be emitted for provider policy success.

## Open Questions

- Should `degraded` ever count as connected for a specific provider policy, or must `server-connected` require `healthy` for all providers?
- Should connection attempts be persisted as first-class attempt records?
