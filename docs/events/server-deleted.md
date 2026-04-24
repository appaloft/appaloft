# server-deleted Event Spec

## Metadata

- Event name: `server-deleted`
- Publisher: `servers.delete`
- Aggregate owner: DeploymentTarget / server
- Current status: active event for the guarded delete lifecycle

## Normative Contract

`server-deleted` records that `servers.delete` removed an inactive, unblocked server from normal
deployment-target selection.

The event is a durable lifecycle fact, not proof that any dependent data was cascaded or cleaned up.
Deletion guards must pass before the event is published.

## Payload

```ts
type ServerDeletedEventPayload = {
  serverId: string;
  serverName: string;
  providerKey: string;
  deletedAt: string;
  correlationId?: string;
  causationId?: string;
};
```

Payloads must not include private keys, SSH command output, provider credentials, environment
secret values, certificate material, route provider config, or log excerpts.

## Publication And Idempotency

The event is published or recorded only when a server transitions from inactive to deleted.

Repeated `servers.delete` calls against a resolvable deleted tombstone are idempotent command
successes and must not publish duplicate `server-deleted` events.

Consumers must handle duplicate event delivery idempotently by server id and deleted lifecycle
state. Duplicate delivery must not duplicate audit records, navigation removal, cache
invalidation, or deleted-server tombstones.

## Read Model Semantics

Consumers may remove active server read-model rows or mark them deleted so normal list/show and
target-selection paths omit them. Consumers must preserve enough safe audit/tombstone state to
explain that the server was deleted when a future audit-only query exists.

## Consumers

Consumers may remove active read-model rows, update audit trails, and clear non-authoritative
navigation caches. They must not cascade-delete deployments, resources, destinations, domains,
certificates, credentials, source links, routes, terminal sessions, logs, or audit records.

## Error Handling

Producer failures before command success use `phase = event-publication` in
[Deployment Target Lifecycle Error Spec](../errors/servers.lifecycle.md).

Consumer failures use `phase = event-consumption` and must not reinterpret the original command
result.
