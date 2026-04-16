# certificate-requested Event Spec

## Normative Contract

`certificate-requested` means certificate issuance or renewal has been accepted for a domain binding and a certificate attempt exists.

It is a request event. It does not mean the certificate has been issued.

## Global References

This event inherits:

- [ADR-002: Routing, Domain, And TLS Boundary](../decisions/ADR-002-routing-domain-tls-boundary.md)
- [ADR-007: Certificate Provider And Challenge Default](../decisions/ADR-007-certificate-provider-and-challenge-default.md)
- [ADR-008: Renewal Trigger Model](../decisions/ADR-008-renewal-trigger-model.md)
- [Error Model](../errors/model.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Event Type

First-class application event for certificate lifecycle orchestration.

This event is an internal behavior entrypoint at the same specification level as commands and
queries. It is not a user-facing CLI/API entrypoint; it is consumed by event handlers, workers, or
process managers after a command or another process manager has published it.

## Trigger

Publish after `certificates.issue-or-renew` or a domain binding process manager persists a certificate issuance attempt.

## Publisher

Publisher: certificate use case or domain/certificate process manager after durable attempt state is recorded.

## Consumers

Expected consumers:

- certificate provider worker;
- certificate read-model projection;
- domain-ready process manager;
- audit/notification;
- event monitoring.

## Payload

```ts
type CertificateRequestedPayload = {
  certificateId: string;
  domainBindingId: string;
  domainName: string;
  attemptId: string;
  reason: "issue" | "renew" | "replace";
  providerKey: string;
  challengeType: string;
  requestedAt: string;
  correlationId?: string;
  causationId?: string;
};
```

Payload must not include private keys, ACME account secrets, DNS provider credentials, or challenge token secrets unless the token is explicitly safe for public challenge exposure.

## State Progression

```text
certificate attempt: requested -> issuing
```

## Follow-Up Actions

Successful handling publishes `certificate-issued`.

Failed handling publishes `certificate-issuance-failed`.

## Idempotency

Consumers must dedupe by `(certificateId, attemptId)`.

Duplicate consumption must not create duplicate provider orders for the same attempt.

## Ordering

`certificate-requested` must follow `domain-bound` for automatic domain binding issuance, or an explicit `certificates.issue-or-renew` command for manual operator issuance.

It must precede `certificate-issued` or `certificate-issuance-failed` for the same attempt id.

## Retry And Failure Handling

Retry creates a new certificate attempt id. Raw replay of an old `certificate-requested` event is duplicate handling.

Provider worker failure before state persistence leaves the attempt retryable or unknown until recovered.

## Current Implementation Notes And Migration Gaps

Current code has durable certificate request state, a certificate attempt model, `certificates.issue-or-renew`, `certificates.list`, PostgreSQL/PGlite persistence, CLI/API entrypoints, and `certificate-requested` publication after attempt persistence.

The current provider-worker slice implements a provider-neutral `certificate-requested` event
handler that consumes the event, calls injected certificate provider and secret-store ports, records
issued or failed attempt state, and publishes `certificate-issued` or
`certificate-issuance-failed`. The first implementation is still provider-port driven and does not
ship a real ACME adapter, ACME account model, challenge token serving, or certificate-backed
`domain-ready`.

## Open Questions

- None for the current `certificate-requested` baseline. Provider and challenge defaults are governed by ADR-007.
