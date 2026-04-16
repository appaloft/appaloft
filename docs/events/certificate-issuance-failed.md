# certificate-issuance-failed Event Spec

## Normative Contract

`certificate-issuance-failed` means a certificate issuance or renewal attempt reached terminal failure or recorded retryable failure state.

It does not delete the domain binding. It means TLS readiness is blocked until retry, manual certificate attachment, TLS disablement, or configuration change.

## Global References

This event inherits:

- [ADR-002: Routing, Domain, And TLS Boundary](../decisions/ADR-002-routing-domain-tls-boundary.md)
- [ADR-007: Certificate Provider And Challenge Default](../decisions/ADR-007-certificate-provider-and-challenge-default.md)
- [ADR-008: Renewal Trigger Model](../decisions/ADR-008-renewal-trigger-model.md)
- [Error Model](../errors/model.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Event Type

Domain lifecycle event for certificate attempt failure, published as an application event through the application layer or outbox.

## Trigger

Publish after:

1. a certificate attempt exists;
2. provider issuance, challenge, validation, storage, or renewal fails;
3. failure state is durably recorded with structured error details.

## Publisher

Publisher: certificate provider worker or certificate process manager after durable failure state is recorded.

## Consumers

Expected consumers:

- domain binding process manager;
- certificate read-model projection;
- retry scheduler/process manager;
- audit/notification;
- event monitoring.

## Payload

```ts
type CertificateIssuanceFailedPayload = {
  certificateId: string;
  domainBindingId: string;
  domainName: string;
  attemptId: string;
  failedAt: string;
  errorCode: string;
  failurePhase:
    | "certificate-admission"
    | "challenge-preparation"
    | "provider-request"
    | "domain-validation"
    | "certificate-storage"
    | "renewal-window";
  retriable: boolean;
  retryAfter?: string;
  providerKey?: string;
  correlationId?: string;
  causationId?: string;
};
```

Payload must not include private key material, DNS provider credentials, ACME account secrets, or raw provider response bodies that may contain secrets.

## State Progression

```text
certificate attempt: issuing -> failed | retry_scheduled
domain binding: bound -> tls_failed | bound
```

The domain binding remains durable. If TLS policy requires a certificate, the domain is not ready until recovery.

## Retry

Retry creates a new certificate attempt id.

Duplicate handling of the failed event must not create duplicate retry jobs.

Retriable defaults are governed by ADR-007. Provider unavailable, network timeout, rate limit, and transient storage failures are retriable; invalid challenge configuration and validation failures are non-retriable until configuration changes.

## Idempotency

Consumers must dedupe by `(certificateId, attemptId)`.

## Ordering

`certificate-issuance-failed` must follow `certificate-requested` for the same attempt id and is mutually exclusive with `certificate-issued` for that attempt.

## Current Implementation Notes And Migration Gaps

Current code records failed or retry-scheduled certificate attempt state and publishes
`certificate-issuance-failed` from the `certificate-requested` event handler when injected provider
issuance or secret storage fails.

Current code does not yet implement a real ACME adapter, retry scheduler, provider-specific
challenge validation details, or certificate-backed domain readiness.

## Open Questions

- None for the current `certificate-issuance-failed` baseline. Certificate failure retriability is governed by ADR-007.
