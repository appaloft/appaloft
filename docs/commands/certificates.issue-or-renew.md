# certificates.issue-or-renew Command Spec

## Normative Contract

`certificates.issue-or-renew` is the source-of-truth command for requesting certificate issuance or renewal for a durable domain binding.

Command success means the certificate request has been accepted and an issuance attempt id is available. It does not mean the certificate has been issued.

```ts
type IssueOrRenewCertificateResult = Result<
  { certificateId: string; attemptId: string },
  DomainError
>;
```

The command contract is:

- admission failure returns `err(DomainError)`;
- accepted requests return `ok({ certificateId, attemptId })`;
- accepted requests persist a certificate issuance attempt;
- accepted requests publish `certificate-requested`;
- issuance success or failure progresses asynchronously.

## Global References

This command inherits:

- [ADR-002: Routing, Domain, And TLS Boundary](../decisions/ADR-002-routing-domain-tls-boundary.md)
- [ADR-007: Certificate Provider And Challenge Default](../decisions/ADR-007-certificate-provider-and-challenge-default.md)
- [ADR-008: Renewal Trigger Model](../decisions/ADR-008-renewal-trigger-model.md)
- [ADR-009: Certificates Import Command](../decisions/ADR-009-certificates-import-command.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Purpose

Issue or renew a certificate for an accepted domain binding. The command owns the application contract for certificate lifecycle requests while provider-specific ACME/DNS/HTTP challenge behavior stays behind application/provider boundaries.

The core certificate model and application use case must not choose ACME, HTTP-01, or any future CA/challenge provider through hard-coded branching. Omitted `providerKey` and `challengeType` are resolved by an injected provider selection policy registered by the composition root before certificate state is created.

It is not:

- a deployment command;
- a domain binding creation command;
- a DNS provider adapter call;
- a synchronous certificate availability guarantee;
- a Web wizard step.

## Input Model

| Field | Requirement | Meaning |
| --- | --- | --- |
| `domainBindingId` | Required | Durable domain binding that needs a certificate. |
| `domainName` | Required or derived | Normalized domain name. Required when not derivable from the binding. |
| `certificateId` | Optional | Existing certificate id for renewal. Omitted for first issuance. |
| `reason` | Required | `issue`, `renew`, or `replace`. |
| `providerKey` | Optional | Certificate provider key. The injected default policy resolves omitted values to `acme` according to ADR-007. |
| `challengeType` | Optional | Provider challenge type. The injected default policy resolves omitted values to `http-01` according to ADR-007. |
| `idempotencyKey` | Optional but recommended | Caller-supplied dedupe key for the issuance attempt. |
| `causationId` | Required when event-driven | Event id or command id that requested issuance. |

## Admission Flow

The command must:

1. Validate command input.
2. Resolve the domain binding.
3. Verify the binding is in a state that allows certificate issuance or renewal.
4. Reject `tlsMode = disabled` unless `reason = replace` with an explicit policy that allows stored certificate replacement.
5. Resolve provider key and challenge type through the injected provider selection policy.
6. Resolve or create certificate state for the binding.
7. Reject duplicate in-flight issuance attempts for the same certificate and reason unless the idempotency key matches.
8. Persist a new issuance attempt.
9. Publish or record `certificate-requested`.
10. Return `ok({ certificateId, attemptId })`.

## Async Progression

Required progression:

```text
certificates.issue-or-renew
  -> certificate-requested
  -> certificate-issued | certificate-issuance-failed
  -> domain-ready, when the owning domain binding is otherwise ready
```

Renewal creates a new attempt. It must not rewrite historical issuance attempts.

Manual certificate import is not part of this command. It is governed by `certificates.import` according to ADR-009.

## Domain-Specific Error Codes

| Error code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `command-validation` | No | Input shape, domain name, reason, provider, or challenge type is invalid. |
| `not_found` | `certificate-context-resolution` | No | Domain binding or certificate does not exist. |
| `certificate_not_allowed` | `certificate-admission` | No | Binding TLS policy does not allow issuance or renewal. |
| `certificate_attempt_conflict` | `certificate-admission` | No | Duplicate in-flight issuance attempt conflicts with this command. |
| `certificate_provider_unavailable` | `certificate-admission` | Yes | Required certificate provider is not currently available. |
| `infra_error` | `certificate-attempt-persistence` or `event-publication` | Conditional | Attempt could not be safely persisted or event recorded. |

Provider challenge failure after acceptance is represented by `certificate-issuance-failed`.

## Handler Boundary

The handler must delegate to an application use case and return typed `Result`.

It must not:

- call ACME/provider SDKs directly;
- update deployment runtime plans;
- mutate domain binding readiness without a formal event/state transition;
- hide retry behind raw event replay;
- update read models directly.

## Current Implementation Notes And Migration Gaps

Current code has a first-class `Certificate` aggregate, certificate repository, certificate read
model, PostgreSQL/PGlite persistence, `certificates.issue-or-renew`, `certificates.list`, operation
catalog entries, CLI/API entrypoints, and `certificate-requested` publication for accepted
requests.

Current code resolves omitted provider/challenge values through an injected selection policy
registered by the composition root. The default shell/test composition resolves to `acme` and
`http-01` according to ADR-007. Core and application use cases store provider key and challenge
type as opaque values and do not contain ACME-specific branching or default selection.

Current code implements the `certificate-requested` provider-worker handler through injected
certificate provider and secret-store ports. The default shell composition intentionally registers
an unavailable provider until a real provider adapter is configured, so accepted requests become
retryable `certificate_provider_unavailable` state instead of pretending HTTPS is active.

Current code implements HTTP-01 challenge token serving and a real ACME provider adapter package.
The adapter is activated only by explicit shell certificate-provider configuration; the default
shell profile remains provider-unavailable.

Current code does not yet implement retry scheduler execution or proxy reload.

## Open Questions

- None for the current `certificates.issue-or-renew` baseline. Provider/challenge defaults are governed by ADR-007, renewal triggering is governed by ADR-008, and manual import is governed by ADR-009.
