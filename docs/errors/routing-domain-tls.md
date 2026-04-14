# Routing, Domain Binding, And TLS Error Spec

## Normative Contract

Routing/domain/TLS workflows use the shared platform error model and neverthrow conventions. This file defines only the routing, domain binding, certificate, and domain readiness error profile.

Deployment runtime access-route errors stay within deployment planning/execution unless the caller uses explicit domain binding or certificate commands.

## Global References

This spec inherits:

- [ADR-002: Routing, Domain, And TLS Boundary](../decisions/ADR-002-routing-domain-tls-boundary.md)
- [ADR-005: Domain Binding Owner Scope](../decisions/ADR-005-domain-binding-owner-scope.md)
- [ADR-006: Domain Verification Strategy](../decisions/ADR-006-domain-verification-strategy.md)
- [ADR-007: Certificate Provider And Challenge Default](../decisions/ADR-007-certificate-provider-and-challenge-default.md)
- [ADR-008: Renewal Trigger Model](../decisions/ADR-008-renewal-trigger-model.md)
- [ADR-009: Certificates Import Command](../decisions/ADR-009-certificates-import-command.md)
- [Error Model](./model.md)
- [neverthrow Conventions](./neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Error Details

Routing/domain/TLS errors must include command or event name, phase, related entity ids, and safe provider metadata:

```ts
type RoutingDomainTlsErrorDetails = {
  commandName?:
    | "domain-bindings.create"
    | "certificates.issue-or-renew"
    | "certificates.import";
  eventName?:
    | "domain-binding-requested"
    | "domain-bound"
    | "certificate-requested"
    | "certificate-issued"
    | "certificate-issuance-failed"
    | "certificate-imported"
    | "domain-ready";
  phase:
    | "command-validation"
    | "context-resolution"
    | "domain-binding-admission"
    | "domain-binding-persistence"
    | "domain-verification"
    | "route-realization"
    | "certificate-context-resolution"
    | "certificate-admission"
    | "certificate-attempt-persistence"
    | "challenge-preparation"
    | "provider-request"
    | "domain-validation"
    | "certificate-storage"
    | "certificate-import-validation"
    | "certificate-import-storage"
    | "renewal-window"
    | "domain-ready"
    | "event-publication"
    | "event-consumption";
  step?: string;
  domainBindingId?: string;
  certificateId?: string;
  attemptId?: string;
  domainName?: string;
  projectId?: string;
  environmentId?: string;
  resourceId?: string;
  serverId?: string;
  destinationId?: string;
  proxyKind?: "traefik" | "caddy";
  tlsMode?: "auto" | "disabled";
  providerKey?: string;
  relatedState?: string;
  retryAfter?: string;
  correlationId?: string;
  causationId?: string;
};
```

Secrets, private keys, ACME account secrets, DNS provider credentials, challenge token secrets, and raw provider responses that may contain secrets must not be stored in error details.

## Admission Errors

Admission errors reject the command and return `err(DomainError)`.

| Error code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `command-validation` | No | Input shape, domain name, path prefix, TLS mode, reason, provider, or challenge type is invalid. |
| `not_found` | `context-resolution`, `certificate-context-resolution` | No | Project, environment, resource, server, destination, domain binding, or certificate is missing. |
| `conflict` | `domain-binding-admission`, `certificate-admission` | No | Duplicate active binding or duplicate in-flight certificate attempt conflicts with the command. |
| `domain_binding_proxy_required` | `domain-binding-admission` | No | Durable domain binding requested with proxy disabled. |
| `domain_binding_context_mismatch` | `context-resolution` | No | Referenced project/environment/resource/server/destination relationship is inconsistent. |
| `certificate_not_allowed` | `certificate-admission` | No | Binding TLS policy does not allow issuance or renewal. |
| `certificate_attempt_conflict` | `certificate-admission` | No | Duplicate in-flight certificate attempt conflicts with the command. |
| `certificate_provider_unavailable` | `certificate-admission` | Yes | Required certificate provider is unavailable before acceptance. |
| `infra_error` | persistence or event publication phase | Conditional | State or event could not be safely recorded. |

## Async Error Profile

| Error condition | Required representation | Retriable |
| --- | --- | --- |
| DNS ownership not verified | Binding remains not ready; record `code = domain_ownership_unverified`, `phase = domain-verification`. | No until DNS/configuration/evidence changes. |
| DNS lookup/provider unavailable | Binding remains not ready or retry scheduled; record `code = dns_lookup_failed`, `phase = domain-verification`. | Yes when transient. |
| Route realization fails | Binding remains not ready; record `code = route_realization_failed`, `phase = route-realization`. | Yes when proxy/provider can recover. |
| Certificate challenge preparation fails | `certificate-issuance-failed` with `code = certificate_challenge_preparation_failed`, `failurePhase = challenge-preparation`. | No until configuration changes. |
| Certificate provider request fails | `certificate-issuance-failed` with `code = certificate_provider_unavailable`, `failurePhase = provider-request`. | Yes when transient. |
| Domain validation fails | `certificate-issuance-failed` with `code = certificate_challenge_failed`, `failurePhase = domain-validation`. | No until DNS/binding config changes. |
| Certificate storage fails | `certificate-issuance-failed` with `code = certificate_storage_failed`, `failurePhase = certificate-storage`. | Yes when storage can recover. |
| Imported certificate is invalid, expired, or key mismatched | Import command returns `err` or the import attempt records `code = certificate_import_invalid`, `phase = certificate-import-validation`. | No until certificate material changes. |
| Imported certificate secret storage fails | Import command returns `err` or the import attempt records `code = certificate_import_storage_failed`, `phase = certificate-import-storage`. | Yes when storage can recover. |
| Renewal window invalid | `certificate-issuance-failed` with `code = certificate_renewal_window_invalid`, `failurePhase = renewal-window`. | No unless time/policy changes. |
| Event handler crashes before terminal state | Persist event-processing failure or retryable attempt state; do not publish terminal success/failure until state is known. | Yes |
| Duplicate event consumed | No new side effect; return `ok`. | Not applicable |

## Consumer Requirements

UI, CLI, HTTP API, background workers, and event consumers must use [Error Model](./model.md). Routing/domain/TLS consumers additionally must:

- distinguish domain binding acceptance from domain readiness;
- distinguish certificate request acceptance from certificate issuance;
- show retry affordances only when `retriable = true` and a retry command exists;
- expose domain/certificate attempt ids in structured output when available;
- never expose certificate private keys or provider secrets in UI/CLI/API responses.

## Test Assertions

Tests must assert:

- structured `Result` shape for admission errors;
- routing/domain/TLS-specific `error.code`;
- `phase`;
- `domainBindingId`, `certificateId`, and `attemptId` when relevant;
- terminal failed state and `certificate-issuance-failed` for certificate failure;
- `domain-ready` only after domain binding and TLS gates are satisfied.

## Current Implementation Notes And Migration Gaps

Current code has runtime access-route validation through `AccessRoute`, `PublicDomainName`, `RoutePathPrefix`, and `TlsModeValue`.

Current runtime planning rejects proxy-backed access routes without domains and rejects domains when `proxyKind = none`.

Current runtime adapters can generate Traefik/Caddy labels and public health URLs from deployment runtime plans.

Current `domain-bindings.create` returns structured errors for validation, missing context, active binding conflict, `domain_binding_proxy_required`, and `domain_binding_context_mismatch`.

Current code has durable domain binding state, a domain binding read model, API/CLI list query, and Web console create/list entrypoint for accepted/pending-verification state.

Certificate error model, certificate attempt state, route realization failure state, DNS verification failure state, and domain readiness read model are not implemented yet.

## Open Questions

- None for the current routing/domain/TLS error baseline. Domain verification retriability is governed by ADR-006, certificate issuance retriability is governed by ADR-007, renewal triggering is governed by ADR-008, and manual import boundaries are governed by ADR-009.
