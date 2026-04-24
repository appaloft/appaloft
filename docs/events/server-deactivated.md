# server-deactivated Event Spec

## Metadata

- Event name: `server-deactivated`
- Publisher: `servers.deactivate`
- Consumer scope: read models, deployment admission guards, scheduling/proxy target selectors,
  audit, future MCP/tool projections
- Source classification: normative contract

## Normative Contract

`server-deactivated` records the fact that a deployment target/server was marked inactive.

The event must be published or recorded only after the server lifecycle state is durably persisted.
It must not imply that workloads were stopped, deployments were cancelled, routes were removed,
domains were unbound, certificates were revoked, credentials were detached, logs were deleted, or
the server was destroyed.

## Payload

```ts
type ServerDeactivatedEventPayload = {
  serverId: string;
  deactivatedAt: string;
  reason?: string;
};
```

| Field | Meaning |
| --- | --- |
| `serverId` | Deployment target/server that became inactive. |
| `deactivatedAt` | Timestamp captured by the command clock after admission. |
| `reason` | Optional normalized safe operator note. |

Payloads must not include private keys, SSH output, provider credentials, environment secret
values, certificate material, route provider config, or log excerpts.

## Ordering And Idempotency

The event is emitted once for the first `active -> inactive` transition.

Repeated `servers.deactivate` calls for an already inactive server are idempotent successes and
must not publish duplicate `server-deactivated` events.

Consumers must treat duplicate delivery of the same event id as idempotent.

## Downstream Effects

Consumers may:

- update server read models with inactive lifecycle status, deactivation timestamp, and safe reason;
- remove the server from new target-selection lists where the selector is meant for future work;
- invalidate Web/API/CLI caches for server detail and list surfaces;
- record audit/support metadata.

Consumers must not:

- stop runtime containers;
- cancel active deployments;
- mutate resource/domain/certificate/credential state;
- delete server-applied routes or logs;
- treat event publication as proof that every read model has already updated.

## Current Implementation Notes And Migration Gaps

The first Code Round may publish this event through the existing in-memory event bus and persist the
state on the server aggregate. Durable outbox/inbox, audit projection, and target-selection cache
invalidation remain broader platform gaps.

## Open Questions

- None.
