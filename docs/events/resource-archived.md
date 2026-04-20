# resource-archived Event Spec

## Metadata

- Event name: `resource-archived`
- Publisher: `resources.archive`
- Aggregate owner: Resource
- Current status: active event

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

`reason`, when present, must be the normalized safe `ArchiveReason` accepted by
`resources.archive`. Consumers must not parse, redact, or reinterpret raw user input from the
event.

## Publication And Idempotency

The event is published or recorded only when a resource transitions from active to archived.

Repeated `resources.archive` calls against an already archived resource are idempotent command
successes and must not publish duplicate `resource-archived` events.

Consumers must handle duplicate event delivery idempotently by resource id and archived lifecycle
state. Duplicate delivery must not duplicate audit records, navigation entries, read-model rows, or
support-context state.

## Consumers

Consumers may update resource read models, audit trails, navigation visibility, and command guards.
They must not stop runtime, delete containers, delete source links, remove proxy routes, unbind
domains, or delete deployment history.

Read-model consumers should preserve retained context and expose `lifecycle.status = "archived"`
where the read shape supports lifecycle state. They may hide archived resources from default active
lists only when the list/query spec defines that filtering behavior.

## Error Handling

Producer failures before command success use `phase = event-publication` in
[Resource Lifecycle Error Spec](../errors/resources.lifecycle.md).

Consumer failures use `phase = event-consumption` and must not reinterpret the original command
result.
