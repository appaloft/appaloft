# ADR-035: Certificate Lifecycle Closure

Status: Accepted

Date: 2026-05-01

## Context

Phase 6 needs the certificate lifecycle to close after issue/import visibility. The existing
accepted decisions already separate routing/domain/TLS from deployment input, define provider-driven
issuance and retry attempts, and keep manual import as a separate security boundary. They do not yet
define public show, retry, revoke, and delete semantics for active certificate records.

Certificate lifecycle closure changes public operation identity, durable certificate states, and
provider/secret-store coordination, so it needs a decision before local specs and code expand.

## Decision

Appaloft models certificate show, retry, revoke, and delete as explicit certificate operations.
Domain binding delete remains separate and must not revoke or delete certificates as a side effect.

The canonical public operations are:

- `certificates.show`: read one certificate with safe metadata, latest attempt, historical attempts,
  and no secret material.
- `certificates.retry`: create a new provider-issued attempt from the latest retryable managed
  failure. It dispatches through the same issue/renew use-case path and publishes
  `certificate-requested`. It does not retry domain ownership verification and does not replay old
  certificate events.
- `certificates.revoke`: make an active certificate no longer usable for TLS. Provider-issued
  certificates revoke through the certificate provider boundary when the provider supports
  revocation. Imported certificates have no external CA account in Appaloft, so revoke records
  Appaloft-side TLS disablement and secret-store deactivation intent without pretending the external
  CA revoked the certificate.
- `certificates.delete`: remove the certificate from Appaloft's visible active lifecycle while
  retaining necessary audit history and safe attempt metadata. It does not revoke certificates,
  erase domain bindings, delete generated access, rewrite deployment snapshots, or remove
  server-applied route audit.

Durable certificate state adds:

```text
revoked
deleted
```

`revoked` means Appaloft must not use the certificate for future TLS route realization.
`deleted` means the certificate is no longer returned as an active lifecycle record, but audit
history remains queryable where specs require history.

Delete is allowed only after the certificate is already not active for TLS, such as `revoked`,
`failed`, `expired`, `disabled`, or already `deleted`. Deleting an active certificate must be
rejected so operators do not confuse deletion with revocation.

## Provider And Secret Boundaries

Provider-issued certificate revocation may require provider/CA cooperation. The application layer
depends only on provider-neutral ports. Provider SDK types, account keys, PEM bodies, private keys,
and raw provider responses must not leak into core, command/query schemas, events, errors, read
models, Web, CLI, logs, or public docs.

Imported certificate revocation is Appaloft-local because the platform did not issue the
certificate and may not be able to revoke it with the external CA. Imported revoke records safe
metadata and prevents Appaloft from using the certificate, but it must not claim external
revocation.

Secret store cleanup/deactivation is a separate secret-store boundary. `certificates.revoke` and
`certificates.delete` may request deactivation of stored references when the store supports it, but
must retain enough audit metadata to explain what happened without exposing secret material.

## Events

`certificate-revoked` is the lifecycle fact after revocation state is durable.

`certificate-deleted` is the lifecycle fact after visible active lifecycle removal is durable.

`certificates.retry` reuses the existing `certificate-requested` event for the new attempt. It must
not publish a new retry event as a substitute for an attempt.

## Consequences

Certificate lifecycle closure remains separate from domain binding lifecycle. Domain binding delete
continues to be blocked by active certificate state and never performs certificate revoke/delete.

Provider-issued and imported certificates share public operation names but differ in provider
coordination. Tests and read models must prove both branches.

Future external CA revocation adapters, secret-store shredding, and audit retention upgrades can
extend the provider/secret-store ports without changing the public operation identities.

## Governed Specs

- [Business Operation Map](../BUSINESS_OPERATION_MAP.md)
- [Core Operations](../CORE_OPERATIONS.md)
- [Domain Model](../DOMAIN_MODEL.md)
- [certificates.show Query Spec](../queries/certificates.show.md)
- [certificates.retry Command Spec](../commands/certificates.retry.md)
- [certificates.revoke Command Spec](../commands/certificates.revoke.md)
- [certificates.delete Command Spec](../commands/certificates.delete.md)
- [Routing, Domain Binding, And TLS Workflow Spec](../workflows/routing-domain-and-tls.md)
- [Routing, Domain Binding, And TLS Error Spec](../errors/routing-domain-tls.md)
- [Routing, Domain Binding, And TLS Test Matrix](../testing/routing-domain-and-tls-test-matrix.md)
- [Certificate Lifecycle Closure Spec](../specs/023-certificate-lifecycle-closure/spec.md)

## Migration Gaps

None are intentionally left by this decision. Code Round must add command/query specs, operation
catalog entries, application handlers/use cases, read/query visibility, CLI/API/Web affordances,
and tests before Phase 6 can mark certificate lifecycle closure complete.
