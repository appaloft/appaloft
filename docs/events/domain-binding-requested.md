# domain-binding-requested Event Spec

## Normative Contract

`domain-binding-requested` means a durable domain binding request has been accepted and binding state exists.

It is a request event. It does not mean DNS ownership is verified, route configuration is active, certificate issuance has started, or the domain is ready for traffic.

## Global References

This event inherits:

- [ADR-002: Routing, Domain, And TLS Boundary](../decisions/ADR-002-routing-domain-tls-boundary.md)
- [ADR-005: Domain Binding Owner Scope](../decisions/ADR-005-domain-binding-owner-scope.md)
- [ADR-006: Domain Verification Strategy](../decisions/ADR-006-domain-verification-strategy.md)
- [ADR-017: Default Access Domain And Proxy Routing](../decisions/ADR-017-default-access-domain-and-proxy-routing.md)
- [Error Model](../errors/model.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Event Type

Application event for routing/domain binding orchestration.

## Trigger

Publish after `domain-bindings.create` persists the domain binding in `requested` or `pending_verification`.

## Publisher

Publisher: `domain-bindings.create` use case or domain binding process manager after durable state is recorded.

## Consumers

Expected consumers:

- domain verification process manager;
- routing/proxy route process manager;
- domain binding read-model projection;
- audit/notification;
- event monitoring.

## Payload

```ts
type DomainBindingRequestedPayload = {
  domainBindingId: string;
  projectId: string;
  environmentId: string;
  resourceId: string;
  serverId: string;
  destinationId: string;
  domainName: string;
  pathPrefix: string;
  edgeProxyProviderKey?: string;
  tlsMode: "auto" | "disabled";
  certificatePolicy: "auto" | "manual" | "disabled";
  verificationAttemptId: string;
  requestedAt: string;
  correlationId?: string;
  causationId?: string;
};
```

Payload must not contain DNS provider credentials, certificate private keys, or raw secret material.

## State Progression

```text
domain binding: requested -> pending_verification
```

## Follow-Up Actions

Consumers may:

- record or update public DNS observation state for the requested hostname;
- verify DNS/domain ownership;
- wait/retry when public DNS propagation is pending or resolver-specific;
- run confirmation-file route proof when configured;
- verify that the server proxy policy can serve the binding;
- publish `domain-bound` when route/domain requirements are satisfied;
- persist verification failure state when requirements are not satisfied.

## Idempotency

Consumers must dedupe by event id when available, otherwise by `(domainBindingId, "domain-binding-requested")`.

Duplicate consumption must not create duplicate verification attempts for the same binding and attempt id. The first verification attempt id is allocated before this event is published.

## Ordering

`domain-binding-requested` must occur after binding persistence and before `domain-bound`.

## Retry And Failure Handling

Consumer failure is event-processing failure unless a workflow state transition failed and was recorded.

Retry must create or select a new verification attempt according to the workflow contract. Raw replay of this event is duplicate handling, not retry.

## Current Implementation Notes And Migration Gaps

Current code now records `domain-binding-requested` from the `DomainBinding` aggregate after `domain-bindings.create` persists binding state and the first manual verification attempt.

Current code also persists initial DNS observation metadata for the accepted binding so
`domain-bindings.list` can show that Appaloft is waiting for public DNS propagation or a later
observer.

Deployment runtime access routes currently carry `domains`, but those routes do not publish this event and do not create durable domain binding state.

Generated default access routes do not publish this event and do not create durable domain binding state.

No event consumer/process manager for live DNS lookup, confirmation-file route proof, or DNS
provider writes is implemented yet.

## Open Questions

- None for the current `domain-binding-requested` baseline. Verification attempt allocation is governed by ADR-006.
