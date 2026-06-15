# resource-restored Event Spec

## Metadata

- Event name: `resource-restored`
- Publisher: `resources.restore`
- Aggregate owner: Resource
- Current status: active event

## Normative Contract

`resource-restored` records that `resources.restore` durably moved a resource from archived back to
active lifecycle status.

The event is a durable lifecycle fact, not proof that runtime was started, routes were recreated,
domains were rebound, dependencies were changed, or deployment history was rewritten.

## Payload

```ts
type ResourceRestoredEventPayload = {
  resourceId: string;
  projectId: string;
  environmentId: string;
  resourceSlug: string;
  restoredAt: string;
  previousArchivedAt?: string;
  previousArchiveReason?: string;
  correlationId?: string;
  causationId?: string;
};
```

Payloads must not include secrets, source credentials, provider credentials, runtime logs, or
deployment log lines.

`previousArchiveReason`, when present, must be the normalized safe `ArchiveReason` previously
accepted by `resources.archive`.

## Publication And Idempotency

The event is published or recorded only when a resource transitions from archived to active.

Repeated `resources.restore` calls against an already active resource are idempotent command
successes and must not publish duplicate `resource-restored` events.

Consumers must handle duplicate event delivery idempotently by resource id and active lifecycle
state. Duplicate delivery must not duplicate audit records, navigation entries, read-model rows, or
support-context state.

## Consumers

Consumers may update resource read models, audit trails, navigation visibility, and command guards.
They must not start runtime, create containers, recreate source links, add proxy routes, bind
domains, or rewrite deployment history.

Read-model consumers should preserve retained context and expose `lifecycle.status = "active"`
where the read shape supports lifecycle state.
