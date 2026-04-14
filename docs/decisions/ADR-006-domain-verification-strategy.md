# ADR-006: Domain Verification Strategy

Status: Accepted

Date: 2026-04-14

## Decision

The first implementation uses manual domain verification backed by durable verification attempts.

The platform records the expected verification target and operator-facing instructions. An operator or future automation confirms verification through an explicit verification command or process step. DNS provider integrations and automated DNS lookup can be added later behind the same verification attempt model.

## Context

Durable domain binding must not become ready merely because a deployment runtime plan contains a domain string. The system needs a formal verification gate before publishing `domain-bound`.

## Options Considered

| Option | Rule | Result |
| --- | --- | --- |
| Manual verification first | Platform records verification requirements; operator or automation confirms through an explicit step. | Accepted. |
| DNS lookup adapter first | Platform performs DNS queries and verifies expected records automatically. | Deferred. Useful after verification attempt model exists. |
| DNS provider integration first | Platform writes/reads DNS provider records through provider adapters. | Deferred. Requires provider-specific credentials and permissions. |
| No verification | Binding becomes bound immediately after command acceptance. | Rejected. It makes `domain-bound` untrustworthy. |

## Chosen Rule

`domain-binding-requested` must reference a verification attempt before `domain-bound` can be published. The publisher of `domain-binding-requested` must allocate and persist the first `verificationAttemptId` as part of command admission or the immediately following domain binding process-manager step.

The required verification attempt fields are:

- `domainBindingId`;
- `verificationAttemptId`;
- normalized `domainName`;
- verification method, initially `manual`;
- expected target or instruction text;
- status;
- safe evidence metadata;
- actor or automation id that confirmed verification;
- timestamps;
- correlation id and causation id.

Safe evidence metadata must include the verification method, expected target or instruction, who or what confirmed the evidence, checked/confirmed timestamps when available, and non-secret DNS/route observations when available. It must not include provider credentials, private keys, or raw secret-bearing provider responses.

`domain-bound` may be published only after the verification attempt is recorded as successful.

Manual verification must not bypass the write-side state transition. UI/CLI/API confirmation must dispatch an explicit command or process-manager action, not update a read model directly.

Verification failure retry rules:

- `domain_ownership_unverified` is non-retriable until DNS/configuration/evidence changes.
- `dns_lookup_failed`, DNS provider unavailable, or transient route/provider failures are retriable.
- invalid domain binding context, unsupported verification method, and inconsistent owner scope are non-retriable.
- each retry creates a new verification attempt id; old failed attempts remain historical state.

## Consequences

The platform can ship a durable domain binding workflow before adding DNS provider integrations.

Manual verification creates an auditable state transition but requires operator action. Automated DNS lookup and provider integrations can later reuse the same attempt model.

Tests can begin with a manual verification fake, then add DNS adapter/provider fakes without changing the domain event semantics.

## Governed Specs

- [domain-bindings.create Command Spec](../commands/domain-bindings.create.md)
- [domain-binding-requested Event Spec](../events/domain-binding-requested.md)
- [domain-bound Event Spec](../events/domain-bound.md)
- [Routing, Domain Binding, And TLS Workflow Spec](../workflows/routing-domain-and-tls.md)
- [Routing, Domain Binding, And TLS Error Spec](../errors/routing-domain-tls.md)
- [Routing, Domain Binding, And TLS Test Matrix](../testing/routing-domain-and-tls-test-matrix.md)
- [domain-bindings.create Implementation Plan](../implementation/domain-bindings.create-plan.md)

## Current Implementation Notes And Migration Gaps

Current code has no durable domain verification attempt model, DNS adapter, or provider integration for domain verification.

## Superseded Open Questions

- Should DNS ownership verification be modeled in this command family or deferred to provider-specific integration commands?
- Should the first verification attempt id be part of this event payload or allocated by the verifier consumer?
- Which verification evidence should be persisted for audit before publishing `domain-bound`?
- Should DNS/domain ownership verification be adapter-owned, provider-owned, or implemented first as manual verification?
- Should DNS verification tests begin with a manual verification fake, a DNS adapter fake, or both?
