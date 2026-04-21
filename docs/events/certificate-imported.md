# certificate-imported Event Spec

## Normative Contract

`certificate-imported` means a manual certificate import completed successfully: the imported
certificate chain and private key were validated, stored through approved secret handling, and
durable certificate state was recorded with `source = imported`.

It does not mean provider-driven issuance occurred, and it does not mean every route using the
domain is already healthy.

## Global References

This event inherits:

- [ADR-002: Routing, Domain, And TLS Boundary](../decisions/ADR-002-routing-domain-tls-boundary.md)
- [ADR-008: Renewal Trigger Model](../decisions/ADR-008-renewal-trigger-model.md)
- [ADR-009: Certificates Import Command](../decisions/ADR-009-certificates-import-command.md)
- [Error Model](../errors/model.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Event Type

Domain lifecycle event for manual certificate state, published as an application event through the
application layer or outbox.

## Trigger

Publish after:

1. a `certificates.import` command resolves an eligible domain binding;
2. certificate chain, private key, and optional passphrase are validated successfully;
3. secret references are durably stored;
4. certificate state is durably recorded as active imported certificate state.

## Publisher

Publisher: `certificates.import` use case after durable imported-certificate state is recorded.

## Consumers

Expected consumers:

- domain-ready process manager;
- certificate read-model projection;
- resource access summary/domain status projection;
- audit/notification;
- edge proxy route activation or reload process when imported certificate state changes require it.

## Payload

```ts
type CertificateImportedPayload = {
  certificateId: string;
  domainBindingId: string;
  domainName: string;
  attemptId: string;
  importedAt: string;
  source: "imported";
  notBefore: string;
  expiresAt: string;
  subjectAlternativeNames: string[];
  keyAlgorithm: string;
  issuer?: string;
  fingerprint?: string;
  correlationId?: string;
  causationId?: string;
};
```

Payload must not include private key material, passphrases, raw PEM bodies, secret references, or
provider credentials.

## State Progression

```text
certificate import attempt: validating|storing -> imported
certificate: pending|active|failed -> active(source = imported)
```

If the domain binding is otherwise bound and route-ready, this event should lead to `domain-ready`.

## Idempotency

Consumers must dedupe by `(certificateId, attemptId)`.

Duplicate handling must not duplicate `domain-ready`, notifications, or edge-proxy reload side
effects.

## Ordering

`certificate-imported` must follow successful `certificates.import` persistence for the same
attempt id.

It must not be paired with `certificate-issued` for the same attempt id.

Later provider-driven replacement or renewal may emit `certificate-issued` for a different attempt,
but manual import success never reuses the provider-issued success event.

## Retry And Failure Handling

Validation or storage failures before durable success are represented by command rejection, not by
this event.

Consumer failure after publication is event-processing failure and must not rewrite imported
certificate state to failed.

## Current Implementation Notes And Migration Gaps

`certificate-imported` is now implemented and consumed by the manual readiness path so that manual
certificate imports can drive `domain-ready` when the binding is already route-ready. Durable
PG/PGlite-backed secret persistence now exists before publication, so the event is no longer gated
on temporary ref-only storage.

Remaining migration gaps:

- none for the normative `certificate-imported` baseline.

## Open Questions

- None for the current `certificate-imported` baseline. Manual import boundary is governed by
  ADR-009.
