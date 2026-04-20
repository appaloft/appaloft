# resource-deleted Event Spec

## Metadata

- Event name: `resource-deleted`
- Publisher: `resources.delete`
- Aggregate owner: Resource
- Current status: active event for the guarded delete lifecycle

## Normative Contract

`resource-deleted` records that `resources.delete` removed an archived, unreferenced resource from
normal active resource state.

The event is a durable lifecycle fact, not proof that any dependent data was cascaded or cleaned up.
Deletion guards must pass before the event is published.

## Payload

```ts
type ResourceDeletedEventPayload = {
  resourceId: string;
  projectId: string;
  environmentId: string;
  resourceSlug: string;
  deletedAt: string;
  correlationId?: string;
  causationId?: string;
};
```

Payloads must not include secrets, source credentials, provider credentials, runtime logs,
deployment log lines, certificate material, or provider-native route configs.

## Publication And Idempotency

The event is published or recorded only when a resource transitions from archived to deleted.

Repeated `resources.delete` calls against a resolvable deleted tombstone are idempotent command
successes and must not publish duplicate `resource-deleted` events.

Consumers must handle duplicate event delivery idempotently by resource id and deleted lifecycle
state. Duplicate delivery must not duplicate audit records, navigation removal, cache invalidation,
or deleted-resource tombstones.

## Read Model Semantics

Consumers may remove active resource read-model rows or mark them deleted so normal read paths
omit them. Consumers must preserve enough safe audit/tombstone state to explain that the resource
was deleted when a future audit-only query exists.

## Consumers

Consumers may remove active read-model rows, update audit trails, and clear non-authoritative
navigation caches. They must not cascade-delete deployments, domains, certificates, runtime
instances, source links, dependency resources, or logs.

## Error Handling

Producer failures before command success use `phase = event-publication` in
[Resource Lifecycle Error Spec](../errors/resources.lifecycle.md).

Consumer failures use `phase = event-consumption` and must not reinterpret the original command
result.
