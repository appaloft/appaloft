# resource-health-policy-configured Event Spec

## Normative Contract

`resource-health-policy-configured` means a `Resource` aggregate's reusable health policy changed
and was persisted.

It does not mean a deployment started, runtime restarted, proxy configuration changed, public access
was probed, or the resource is healthy.

## Global References

This event inherits:

- [resources.configure-health Command Spec](../commands/resources.configure-health.md)
- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-020: Resource Health Observation](../decisions/ADR-020-resource-health-observation.md)
- [Resource Health Observation Workflow](../workflows/resource-health-observation.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Event Type

Domain event emitted by the `Resource` aggregate and publishable as an application event for
projections, audit, and workflow observers.

## Trigger

Publish or record after `resources.configure-health` persists the updated `Resource` aggregate.

## Publisher

Publisher: `resources.configure-health` use case after durable persistence, using domain events
recorded by the `Resource` aggregate.

## Consumers

Expected consumers:

- resource read-model projection;
- audit/notification consumers;
- future scheduled resource health observer;
- future automation/MCP observers.

Consumers must not automatically dispatch `deployments.create`, restart runtime, or mark the
resource healthy from this event alone.

## Payload

```ts
type ResourceHealthPolicyConfiguredPayload = {
  resourceId: string;
  projectId: string;
  environmentId: string;
  enabled: boolean;
  type: "http";
  http?: {
    method: "GET" | "HEAD" | "POST" | "OPTIONS";
    scheme: "http" | "https";
    host: string;
    port?: number;
    path: string;
    expectedStatusCode: number;
    expectedResponseText?: string;
  };
  intervalSeconds: number;
  timeoutSeconds: number;
  retries: number;
  startPeriodSeconds: number;
  configuredAt: string;
  correlationId?: string;
  causationId?: string;
};
```

Payload must not contain response bodies, credentials, request headers, environment secret values,
provider credentials, private keys, or raw deployment logs.

## State Progression

```text
Resource exists
  -> runtimeProfile.healthCheck changed
  -> resource-health-policy-configured
```

## Follow-Up Actions

Consumers may:

- update resource read models;
- update audit history;
- wake a future scheduled observer that refreshes cached health summaries.

Consumers must not automatically deploy, restart, or repair the resource.

## Idempotency

Consumers must dedupe by event id when available. If event ids are unavailable, consumers may dedupe
by `(resourceId, configuredAt, "resource-health-policy-configured")`.

Duplicate consumption must not create duplicate read-model rows or duplicate probe attempts.

## Ordering

`resource-health-policy-configured` must occur after the resource is durably persisted and before
dependent workflow steps rely on the new policy.

There is no required ordering with deployment events. A later deployment may snapshot the policy,
but the event itself is not a deployment request.

## Retry And Failure Handling

Consumer failure is event-processing failure, not command failure.

If event publication cannot be safely recorded before returning command success,
`resources.configure-health` must return `err(DomainError)` with `code = infra_error` and `phase =
event-publication`.

## Current Implementation Notes And Migration Gaps

The initial implementation publishes this event from the explicit resource health policy command.

Background observers and durable outbox/inbox processing remain migration gaps.

## Open Questions

- None for the v1 HTTP health policy configuration slice.
