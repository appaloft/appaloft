# domain-route-realization-failed Event Spec

## Normative Contract

`domain-route-realization-failed` means a durable domain binding cannot currently serve traffic
because the route/proxy realization gate failed after a deployment or certificate-backed proxy
configuration change.

It does not delete the binding and does not rewrite the original command result. It records
post-acceptance readiness failure so users can distinguish ownership-confirmed domains from
traffic-ready domains.

## Global References

This event inherits:

- [ADR-002: Routing, Domain, And TLS Boundary](../decisions/ADR-002-routing-domain-tls-boundary.md)
- [ADR-019: Edge Proxy Provider And Observable Configuration](../decisions/ADR-019-edge-proxy-provider-and-observable-configuration.md)
- [Routing, Domain Binding, And TLS Workflow Spec](../workflows/routing-domain-and-tls.md)
- [Edge Proxy Provider And Route Realization Workflow Spec](../workflows/edge-proxy-provider-and-route-realization.md)
- [Error Model](../errors/model.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Event Type

Domain lifecycle event for route readiness failure, published as an application event through the
application layer or outbox.

## Trigger

Publish after:

1. a deployment or proxy activation step has durably failed with a route realization phase;
2. at least one active durable domain binding is associated with the failed resource route;
3. the affected binding is durably marked `not_ready` with safe route failure metadata.

## Publisher

Publisher: route realization process manager after it consumes the deployment/proxy failure fact and
persists affected domain binding state.

## Consumers

Expected consumers:

- domain binding read-model projection;
- resource health/read-model projection;
- audit/notification;
- retry scheduler/process manager for route realization when introduced.

## Payload

```ts
type DomainRouteRealizationFailedPayload = {
  domainBindingId: string;
  domainName: string;
  pathPrefix: string;
  projectId: string;
  environmentId: string;
  resourceId: string;
  serverId: string;
  destinationId: string;
  deploymentId: string;
  failedAt: string;
  errorCode: string;
  failurePhase:
    | "proxy-route-realization"
    | "proxy-reload"
    | "public-route-verification";
  retriable: boolean;
  errorMessage?: string;
  correlationId?: string;
  causationId?: string;
};
```

Payload must not include provider credentials, TLS private key material, raw command environments,
authorization headers, or unredacted secret values.

## State Progression

```text
domain binding: bound | certificate_pending | ready -> not_ready
```

Bindings in `requested`, `pending_verification`, `failed`, or already terminal verification failure
states are not route-realization candidates.

## Retry

Retry creates a new route/deployment/proxy realization attempt. It must not replay the old
`domain-bound`, `certificate-issued`, or `domain-route-realization-failed` event as the retry
mechanism.

## Idempotency

Consumers and process managers must dedupe by `(domainBindingId, deploymentId, failurePhase)`.

Duplicate handling must not duplicate events or mutate a newer ready binding back to an older
failure.

## Ordering

`domain-route-realization-failed` must follow the route/deployment failure fact that caused it. It
must not follow `domain-ready` for the same binding unless a later route realization attempt fails.

## Current Implementation Notes And Migration Gaps

Current code records route realization failure through deployment status, runtime metadata, durable
domain binding `not_ready` state, this event, and safe `domain-bindings.list` route failure metadata.

Route retry scheduling is a later behavior; this slice records the failed state and exposes it.

## Open Questions

- None for the v1 route realization failure baseline.
