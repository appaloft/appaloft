# resource-archived Event Spec

## Normative Contract

`resource-archived` records that `resources.archive` durably moved a resource into archived
lifecycle status.

The event is a durable lifecycle fact, not proof that runtime was stopped, domains were removed,
certificates were revoked, source links were deleted, or deployment history was cleaned up.

## Payload

```ts
type ResourceArchivedEventPayload = {
  resourceId: string;
  projectId: string;
  environmentId: string;
  resourceSlug: string;
  archivedAt: string;
  reason?: string;
  correlationId?: string;
  causationId?: string;
};
```

Payloads must not include secrets, source credentials, provider credentials, runtime logs, or
deployment log lines.

## Consumers

Consumers may update resource read models, audit trails, navigation visibility, and command guards.
They must not stop runtime, delete containers, delete source links, remove proxy routes, unbind
domains, or delete deployment history.

## Error Handling

Producer failures before command success use `phase = event-publication` in
[Resource Lifecycle Error Spec](../errors/resources.lifecycle.md).

Consumer failures use `phase = event-consumption` and must not reinterpret the original command
result.
