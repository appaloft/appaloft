# resource-created Event Spec

## Normative Contract

`resource-created` means a `Resource` aggregate has been persisted and can be referenced by later commands.

It does not mean the resource has been deployed, source binding has been configured, routing is ready, variables are set, or the resource is healthy.

## Global References

This event inherits:

- [ADR-011: Resource Create Minimum Lifecycle](../decisions/ADR-011-resource-create-minimum-lifecycle.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Event Type

Domain event emitted by the `Resource` aggregate and publishable as an application event for projections, audit, and workflow observers.

## Trigger

Publish or record after `resources.create` persists the `Resource` aggregate.

## Publisher

Publisher: `resources.create` use case after durable persistence, using domain events recorded by the `Resource` aggregate.

## Consumers

Expected consumers:

- resource read-model projection;
- audit/notification consumers;
- Quick Deploy workflow observers;
- future resource detail/status projections;
- future automation/MCP observers.

Consumers must not assume that a deployment should start automatically from this event.

## Payload

```ts
type ResourceCreatedPayload = {
  resourceId: string;
  projectId: string;
  environmentId: string;
  destinationId?: string;
  name: string;
  slug: string;
  kind: "application" | "service" | "database" | "cache" | "compose-stack" | "worker" | "static-site" | "external";
  services: Array<{
    name: string;
    kind: "web" | "api" | "worker" | "database" | "cache" | "service";
  }>;
  createdAt: string;
  correlationId?: string;
  causationId?: string;
};
```

Payload must not contain source credentials, environment secret values, provider credentials, or raw deployment logs.

## State Progression

```text
no Resource
  -> Resource persisted
  -> resource-created
```

The event corresponds to resource profile creation only.

## Follow-Up Actions

Consumers may:

- update resource read models;
- update audit history;
- unblock entry workflows waiting for a `resourceId`;
- notify observers that a resource was created.

Consumers must not automatically dispatch `deployments.create` unless a separate workflow command/process explicitly owns that behavior.

## Idempotency

Consumers must dedupe by event id when available, otherwise by `(resourceId, "resource-created")`.

Duplicate consumption must not create duplicate resource summaries or start duplicate deployments.

## Ordering

`resource-created` must occur after the resource is durably persisted and before dependent workflow steps rely on the resource id.

There is no required ordering with deployment events unless a specific workflow creates a resource and then dispatches `deployments.create`.

## Retry And Failure Handling

Consumer failure is event-processing failure, not resource creation failure.

If event publication cannot be safely recorded before returning command success, `resources.create` must return `err(DomainError)` with `code = infra_error` and `phase = event-publication`.

If a projection consumer fails after the event is recorded, the resource remains created and projection retry belongs to the consumer/process infrastructure.

## Current Implementation Notes And Migration Gaps

Current `Resource.create` records `resource-created` as the canonical source-of-truth event name.

Current deployment bootstrap publishes the aggregate event when it creates a resource during deployment context resolution.

`resources.create` publishes this event from the explicit resource lifecycle operation after durable resource persistence.

## Open Questions

- None for the minimum lifecycle.
