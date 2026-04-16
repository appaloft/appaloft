# certificate-issued Event Spec

## Normative Contract

`certificate-issued` means a certificate issuance or renewal attempt succeeded and certificate state is durably recorded.

It does not mean every route using the domain is healthy.

## Global References

This event inherits:

- [ADR-002: Routing, Domain, And TLS Boundary](../decisions/ADR-002-routing-domain-tls-boundary.md)
- [ADR-007: Certificate Provider And Challenge Default](../decisions/ADR-007-certificate-provider-and-challenge-default.md)
- [ADR-008: Renewal Trigger Model](../decisions/ADR-008-renewal-trigger-model.md)
- [ADR-009: Certificates Import Command](../decisions/ADR-009-certificates-import-command.md)
- [Error Model](../errors/model.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Event Type

Domain lifecycle event for certificate state, published as an application event through the application layer or outbox.

## Trigger

Publish after:

1. a certificate attempt exists;
2. provider issuance or renewal succeeds;
3. certificate state is durably recorded as issued/active;
4. private key and certificate material are stored through approved secret storage.

## Publisher

Publisher: certificate provider worker or certificate process manager after durable state is recorded.

## Consumers

Expected consumers:

- domain-ready process manager;
- certificate read-model projection;
- audit/notification;
- route/proxy reload process when required.

## Payload

```ts
type CertificateIssuedPayload = {
  certificateId: string;
  domainBindingId: string;
  domainName: string;
  attemptId: string;
  issuedAt: string;
  expiresAt: string;
  providerKey: string;
  fingerprint?: string;
  correlationId?: string;
  causationId?: string;
};
```

Payload must not include private key material or raw certificate secret material.

`certificate-issued` is reserved for provider-driven issuance or renewal success. Manual import must publish `certificate-imported`.

## State Progression

```text
certificate attempt: issuing -> issued
certificate: pending|renewing -> active
```

If the domain binding is otherwise bound and route-ready, this event should lead to `domain-ready`.

## Idempotency

Consumers must dedupe by `(certificateId, attemptId)`.

Duplicate handling must not duplicate domain-ready side effects or notifications.

## Ordering

`certificate-issued` must follow `certificate-requested` for the same attempt id and is mutually exclusive with `certificate-issuance-failed` for that attempt.

## Retry And Failure Handling

Consumer failure is event-processing failure and must not rewrite issued certificate state to failed.

Later certificate revocation, expiry, or health failure must be represented by a new event/command, not by rewriting this historical event.

## Current Implementation Notes And Migration Gaps

Current code records issued certificate attempt state and publishes `certificate-issued` from the
`certificate-requested` event handler after injected provider issuance and secret storage both
succeed.

Current code does not yet implement a real ACME adapter, challenge token serving, proxy reload, or
certificate-backed `domain-ready` continuation.

## Open Questions

- None for the current `certificate-issued` baseline. Fingerprint optionality is governed by ADR-007, and manual import is governed by ADR-009.
