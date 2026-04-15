# domain-bound Event Spec

## Normative Contract

`domain-bound` means a durable domain binding has satisfied the platform's domain binding requirements for routing ownership.

It does not mean certificate issuance has completed. It does not mean every deployment using the domain is healthy.

## Global References

This event inherits:

- [ADR-002: Routing, Domain, And TLS Boundary](../decisions/ADR-002-routing-domain-tls-boundary.md)
- [ADR-005: Domain Binding Owner Scope](../decisions/ADR-005-domain-binding-owner-scope.md)
- [ADR-006: Domain Verification Strategy](../decisions/ADR-006-domain-verification-strategy.md)
- [Error Model](../errors/model.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Event Type

Domain lifecycle event for domain binding state, published as an application event through the application layer or outbox.

## Trigger

Publish after:

1. a domain binding exists;
2. DNS/ownership/route prerequisites required by policy are satisfied;
3. binding state is durably recorded as `bound`;
4. safe verification metadata is recorded.

## Publisher

Publisher: domain verification process manager or domain binding aggregate behavior that records the bound state.

## Consumers

Expected consumers:

- certificate process manager;
- domain-ready process manager;
- domain binding read-model projection;
- audit/notification;
- deployment admission/readiness checks.

## Payload

```ts
type DomainBoundPayload = {
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
  certificatePolicy: "auto" | "manual" | "disabled";
  boundAt: string;
  verificationAttemptId: string;
  correlationId?: string;
  causationId?: string;
};
```

## State Progression

```text
domain binding: pending_verification -> bound
```

If `tlsMode = disabled` or `certificatePolicy = disabled`, this event may lead to `domain-ready` after route readiness is satisfied.

If certificate policy requires automatic issuance, this event must lead to `certificate-requested`.

## Idempotency

Consumers must dedupe by `(domainBindingId, "domain-bound", verificationAttemptId)` when attempt id is available.

Duplicate handling must not request duplicate certificates for the same binding and certificate policy.

## Ordering

`domain-bound` must follow `domain-binding-requested` and must precede `certificate-requested` or `domain-ready`.

## Retry And Failure Handling

Consumer failure must be tracked separately from the binding fact. If certificate request creation fails after this event, the binding remains bound and certificate workflow failure is recorded separately.

## Current Implementation Notes And Migration Gaps

Current runtime routes may become reachable through proxy labels, but no durable domain binding state or `domain-bound` event exists.

## Open Questions

- None for the current `domain-bound` baseline. Verification evidence requirements are governed by ADR-006.
