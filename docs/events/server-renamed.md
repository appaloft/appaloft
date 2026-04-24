# server-renamed Event Spec

## Metadata

- Event name: `server-renamed`
- Publisher: `servers.rename`
- Aggregate owner: DeploymentTarget / server
- Current status: active event for server display-name changes

## Normative Contract

`server-renamed` records that a deployment target/server display name changed.

The event is a user-visible lifecycle fact for labels and navigation. It must be published or
recorded only after the new server name is durably persisted.

The event does not imply any change to server id, host, port, provider, credential, proxy,
lifecycle status, destination, deployment history, domain history, route state, logs, audit
records, or provider-owned runtime state.

## Payload

```ts
type ServerRenamedEventPayload = {
  serverId: string;
  previousName: string;
  name: string;
  renamedAt: string;
  correlationId?: string;
  causationId?: string;
};
```

| Field | Meaning |
| --- | --- |
| `serverId` | Deployment target/server whose display name changed. |
| `previousName` | Safe previous display name. |
| `name` | Safe new display name. |
| `renamedAt` | Timestamp captured by the command clock after admission. |

Payloads must not include private keys, SSH command output, provider credentials, environment
secret values, certificate material, route provider config, or log excerpts.

## Publication And Idempotency

The event is emitted only when the normalized display name changes.

Repeated `servers.rename` calls with the same normalized name are idempotent command successes and
must not publish duplicate `server-renamed` events.

Consumers must handle duplicate event delivery idempotently by server id and durable renamed state.
Duplicate delivery must not duplicate audit records, notifications, cache invalidations, or
read-model writes.

## Read Model Semantics

Consumers may update server list/detail projections, navigation labels, target-selection labels,
audit trails, and cache entries. Historical records that carry only server ids do not need
migration.

## Consumers

Consumers may refresh labels and invalidate non-authoritative caches. They must not mutate
credentials, routes, resources, deployments, destinations, domains, certificates, terminal
sessions, logs, audit retention, or runtime state.

## Error Handling

Producer failures before command success use `phase = event-publication` in
[Deployment Target Lifecycle Error Spec](../errors/servers.lifecycle.md).

Consumer failures use `phase = event-consumption` and must not reinterpret the original command
result.

## Current Implementation Notes And Migration Gaps

The first implementation may publish this event through the existing in-memory event bus after the
server aggregate is persisted. Durable outbox/inbox, audit projection, and target-selection cache
invalidation remain broader platform gaps.

## Open Questions

- None.
