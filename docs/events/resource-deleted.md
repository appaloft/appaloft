# resource-deleted Event Spec

## Normative Contract

`resource-deleted` records that `resources.delete` permanently removed an archived, unreferenced
resource from normal active resource state.

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

## Consumers

Consumers may remove active read-model rows, update audit trails, and clear non-authoritative
navigation caches. They must not cascade-delete deployments, domains, certificates, runtime
instances, source links, dependency resources, or logs.

## Error Handling

Producer failures before command success use `phase = event-publication` in
[Resource Lifecycle Error Spec](../errors/resources.lifecycle.md).

Consumer failures use `phase = event-consumption` and must not reinterpret the original command
result.
