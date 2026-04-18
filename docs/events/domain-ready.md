# domain-ready Event Spec

## Normative Contract

`domain-ready` means a domain binding satisfies the platform's routing and TLS readiness gates and can be used for traffic according to its policy.

It does not mean every deployment behind the domain is healthy.

## Global References

This event inherits:

- [ADR-002: Routing, Domain, And TLS Boundary](../decisions/ADR-002-routing-domain-tls-boundary.md)
- [ADR-005: Domain Binding Owner Scope](../decisions/ADR-005-domain-binding-owner-scope.md)
- [ADR-008: Renewal Trigger Model](../decisions/ADR-008-renewal-trigger-model.md)
- [ADR-009: Certificates Import Command](../decisions/ADR-009-certificates-import-command.md)
- [Error Model](../errors/model.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Event Type

Domain lifecycle event for domain readiness, published as an application event through the application layer or outbox.

## Trigger

Publish after one of these paths:

```text
domain-bound
  -> route readiness evaluation
  -> domain-ready
```

when TLS is disabled or manually satisfied, or:

```text
domain-bound
  -> route readiness evaluation
  -> certificate-requested
  -> certificate-issued
  -> domain-ready
```

when automatic certificate policy applies.

For manual certificate policy, `domain-ready` may follow `certificate-imported` after the imported certificate is durably validated, stored, and attached.

## Publisher

Publisher: domain binding process manager after verifying all readiness gates and persisting ready state.

## Consumers

Expected consumers:

- domain binding read-model projection;
- resource access summary projection;
- deployment admission/readiness checks;
- Web/CLI notification;
- audit/observability.

## Payload

```ts
type DomainReadyPayload = {
  domainBindingId: string;
  domainName: string;
  pathPrefix: string;
  projectId: string;
  environmentId: string;
  resourceId: string;
  serverId: string;
  destinationId: string;
  edgeProxyProviderKey?: string;
  tlsMode: "auto" | "disabled";
  certificateId?: string;
  readyAt: string;
  correlationId?: string;
  causationId?: string;
};
```

## Readiness Definition

A domain is ready when:

- domain binding state is `bound`;
- proxy kind is enabled and compatible with the server;
- route/proxy policy for the binding is satisfied;
- a current resource route snapshot exists when a serving deployment is required for public access;
- if TLS is disabled, no certificate gate remains;
- if TLS is automatic, certificate state is issued and active;
- if TLS is manual, imported certificate state is valid, active, and attached;
- failure state is visible if readiness cannot be achieved.

Domain readiness does not expire solely because time passes. Degraded or not-ready transitions require a later durable state transition according to ADR-008.

## Idempotency

Consumers must dedupe by exact event id when available, otherwise by `(domainBindingId, "domain-ready", readinessVersion)`.

Duplicate `domain-ready` must not duplicate notifications or admission side effects.

## Ordering

`domain-ready` must follow `domain-bound`.

If TLS/certificate policy requires issuance, it must also follow `certificate-issued`.

It must not follow `certificate-issuance-failed` for the same certificate attempt unless a later successful attempt occurs.

## Retry And Failure Handling

`domain-ready` has no retry semantics by itself. Retry belongs to the failed upstream phase:

- domain verification retry for binding failures;
- certificate issuance retry for certificate failures;
- proxy/route retry for route realization failures.

Consumer failure is event-processing failure, not domain readiness failure.

## Current Implementation Notes And Migration Gaps

Current code can verify deployment public access routes during deployment health checks.

Current code also implements durable domain readiness for TLS-disabled bindings after
`domain-bound`, publishes `domain-ready`, and projects ready bindings into
`ResourceAccessSummary.latestDurableDomainRoute`.

Current code also records retryable route realization failure state by moving affected active
bindings to `not_ready` and publishing `domain-route-realization-failed`.
For TLS-disabled bindings, a later successful deployment route realization can recover the binding
from `not_ready` to `ready`, clear the previous route failure metadata, and publish `domain-ready`.

Readiness expiry and renewal-window scheduling remain follow-up behavior.

## Open Questions

- None for the current `domain-ready` baseline. Readiness expiry and renewal triggering are governed by ADR-008.
