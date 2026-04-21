# certificates.import Implementation Plan

## Source Of Truth

This document is an implementation-planning contract for `certificates.import`. It does not replace
the command/event/testing specs that govern implementation.

Manual certificate import is a separate command boundary and must not be folded into `certificates.issue-or-renew`.

Unlike `certificates.issue-or-renew`, the success path for `certificates.import` is completion-based:
validation, secret storage, durable imported-certificate state, and `certificate-imported` must all
finish before the command returns `ok({ certificateId, attemptId })`.

## Governed ADRs

- [ADR-002: Routing, Domain, And TLS Boundary](../decisions/ADR-002-routing-domain-tls-boundary.md)
- [ADR-008: Renewal Trigger Model](../decisions/ADR-008-renewal-trigger-model.md)
- [ADR-009: Certificates Import Command](../decisions/ADR-009-certificates-import-command.md)

## Governed Specs

- [certificates.import Command Spec](../commands/certificates.import.md)
- [certificate-imported Event Spec](../events/certificate-imported.md)
- [certificates.import Test Matrix](../testing/certificates.import-test-matrix.md)
- [certificate-issued Event Spec](../events/certificate-issued.md)
- [domain-ready Event Spec](../events/domain-ready.md)
- [Routing, Domain Binding, And TLS Error Spec](../errors/routing-domain-tls.md)
- [Routing, Domain Binding, And TLS Workflow Spec](../workflows/routing-domain-and-tls.md)
- [Routing, Domain Binding, And TLS Test Matrix](../testing/routing-domain-and-tls-test-matrix.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Touched Modules And Packages

Expected implementation scope:

- `packages/core/src/runtime-topology`: imported certificate lifecycle state, certificate source value object, imported certificate validation status, expiry timestamp, and transition rules.
- `packages/application/src/operations/certificates`: `certificates.import` command schema, command message, handler, use case, and operation-local validation service.
- `packages/application/src/operation-catalog.ts`: operation catalog entry for `certificates.import`.
- `packages/application/src/ports.ts` and `packages/application/src/tokens.ts`: certificate repository, certificate parser/validator boundary, certificate secret store, event publisher/outbox port, id generator, and clock.
- `packages/persistence/pg`: Kysely persistence for imported certificate state, secret references, read model, and migrations.
- `packages/orpc`: typed command input/output contracts that reuse the application command schema.
- `packages/adapters/cli`: CLI import flow that uses secret-safe input and never echoes private key material.
- `packages/adapters/http-elysia`: HTTP import route that dispatches through the command bus and enforces secret-safe transport handling.
- `apps/shell`: composition-root registration for parser/validator, secret store, repositories, handler, and event publisher.

## Expected Ports And Adapters

Required write-side ports:

- `CertificateRepository`: persists imported certificate lifecycle state.
- `CertificateSecretStore`: stores certificate chain, private key, and optional passphrase without exposing secret material in events, errors, logs, or read models.
- `CertificateMaterialValidator`: validates certificate chain, key match, supported algorithms, domain compatibility, expiry, and safe metadata extraction.
- `DomainBindingRepository`: loads the owning domain binding and confirms manual certificate policy eligibility.
- `DomainEventPublisher` or outbox port: records `certificate-imported`.
- `IdGenerator` and `Clock`: create certificate id/import attempt id and timestamps.

Adapters must treat certificate chain and private key material as secret-bearing input even when a certificate chain is public in other contexts.

## Write-Side State Changes

The minimal write-side model must include:

- certificate source value `imported`;
- imported certificate state with `active`, `invalid`, and `failed` outcomes;
- import attempt idempotency key support;
- secret reference storage instead of raw certificate/key material in aggregate state;
- parsed safe metadata such as subject alternative names, issuer, `notBefore`, `expiresAt`, and optional fingerprint;
- domain binding association for manual certificate policy.

Import success may satisfy `domain-ready` only when the domain binding is bound and all routing gates are satisfied.

## Event Publishing Points

Required event publishing points:

- Publish or record `certificate-imported` after certificate material validation, secret storage, and durable imported certificate state are complete.
- Trigger `domain-ready` evaluation after `certificate-imported`.

`certificate-issued` must not be published for manual import success.

## Error And neverthrow Boundaries

Command admission and import validation must return `err(DomainError)` for:

- invalid command input;
- missing domain binding;
- certificate policy not allowing manual import;
- certificate/domain mismatch;
- expired or not-yet-valid certificate;
- private key mismatch;
- unsupported certificate algorithm or malformed chain;
- duplicate import idempotency conflict;
- secret storage failure before accepted success can be recorded.

Secret storage failures may be retriable when the storage backend can recover. Invalid certificate material is non-retriable until new certificate material is supplied.

No error details, event payload, log line, read model, or UI/CLI/API response may contain private key material, passphrases, ACME account secrets, DNS provider credentials, or raw secret-bearing provider responses.

## Required Tests

Required test coverage:

- Command schema rejects missing domain binding id and missing certificate/key material.
- Certificate material validator rejects key mismatch, expired certificate, domain mismatch, malformed chain, and unsupported algorithm.
- Use case stores certificate material through `CertificateSecretStore` before publishing `certificate-imported`.
- Use case persists only secret references and safe metadata.
- Manual import success triggers `domain-ready` evaluation when the binding is otherwise ready.
- Manual import does not publish `certificate-issued`.
- Duplicate import with the same idempotency key is idempotent.
- Duplicate import with conflicting material and key is rejected with structured `DomainError`.
- HTTP/CLI surfaces never echo private key material or passphrase values.
- Tests assert `error.code`, `phase`, `retriable`, `domainBindingId`, and certificate/import attempt ids rather than message text.

## Minimal Deliverable

The minimal deliverable is:

- `certificates.import` command spec and event spec for `certificate-imported`;
- command, schema, handler, use case, and operation catalog entry;
- safe certificate material validator port with deterministic fixtures;
- certificate secret store port with fake adapter;
- imported certificate state persistence;
- outbox/event publication for `certificate-imported`;
- tests for validation, secret handling, event publication, idempotency, and structured errors.

The command can remain unimplemented while provider-driven issuance is the priority, but no provider-issued command may accept raw manual import material as a shortcut.

## Migration Seams And Legacy Edges

Existing runtime TLS behavior and proxy-managed certificate behavior do not create imported certificate state.

If operators currently rely on external proxy certificates, that path remains an external runtime configuration edge until `certificates.import` is implemented and wired to durable domain bindings.

The migration path must keep manual certificate secret handling isolated from provider issuance code and from deployment runtime access-route planning.

Current post-Code-Round gaps:

- no contract-blocking implementation gaps remain for `certificates.import`;
- a stronger browser automation layer beyond the current resource-scoped Web Bun.WebView coverage is
  optional follow-up, not a contract blocker, if the team later wants a full external-browser path.
