# Routing, Domain Binding, And TLS Error Spec

## Normative Contract

Routing/domain/TLS workflows use the shared platform error model and neverthrow conventions. This file defines only the routing, domain binding, certificate, and domain readiness error profile.

Generated default access and deployment route snapshot errors stay within deployment/access-route planning and execution unless the caller uses explicit domain binding or certificate commands.

Pure CLI/SSH server-applied config domain errors, including canonical redirect graph validation,
belong to the repository config workflow and edge proxy route realization phases unless the intent
is explicitly mapped into managed `DomainBinding` lifecycle by a hosted/self-hosted control plane.

## Global References

This spec inherits:

- [ADR-002: Routing, Domain, And TLS Boundary](../decisions/ADR-002-routing-domain-tls-boundary.md)
- [ADR-005: Domain Binding Owner Scope](../decisions/ADR-005-domain-binding-owner-scope.md)
- [ADR-006: Domain Verification Strategy](../decisions/ADR-006-domain-verification-strategy.md)
- [ADR-007: Certificate Provider And Challenge Default](../decisions/ADR-007-certificate-provider-and-challenge-default.md)
- [ADR-008: Renewal Trigger Model](../decisions/ADR-008-renewal-trigger-model.md)
- [ADR-009: Certificates Import Command](../decisions/ADR-009-certificates-import-command.md)
- [ADR-017: Default Access Domain And Proxy Routing](../decisions/ADR-017-default-access-domain-and-proxy-routing.md)
- [Error Model](./model.md)
- [neverthrow Conventions](./neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Error Details

Routing/domain/TLS errors must include command or event name, phase, related entity ids, and safe provider metadata:

```ts
type RoutingDomainTlsErrorDetails = {
  commandName?:
    | "domain-bindings.create"
    | "domain-bindings.confirm-ownership"
    | "domain-bindings.configure-route"
    | "domain-bindings.delete"
    | "domain-bindings.retry-verification"
    | "certificates.issue-or-renew"
    | "certificates.import";
  eventName?:
    | "domain-binding-requested"
    | "domain-binding-route-configured"
    | "domain-binding-deleted"
    | "domain-binding-verification-retried"
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
    | "domain-binding-route-configuration"
    | "domain-binding-delete"
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
  edgeProxyProviderKey?: string;
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
| `conflict` | `domain-binding-admission` | No | Duplicate active binding conflicts with the command. |
| `domain_binding_proxy_required` | `domain-binding-admission` | No | Durable domain binding requested with proxy disabled. |
| `domain_binding_context_mismatch` | `context-resolution` | No | Referenced project/environment/resource/server/destination relationship is inconsistent. |
| `validation_error` | `domain-binding-route-configuration`, `domain-binding-delete` | No | Route configuration, redirect target, or delete confirmation is invalid. |
| `conflict` | `domain-binding-delete` | No | Delete safety blockers are present, such as active certificate state. |
| `domain_verification_not_pending` | `domain-verification` | No | Ownership confirmation was requested but no pending verification attempt can be confirmed. |
| `domain_ownership_unverified` | `domain-verification` | No | DNS-gated ownership confirmation did not observe the expected target. |
| `dns_lookup_failed` | `domain-verification` | Yes | DNS-gated ownership confirmation could not complete a public DNS lookup through configured resolvers. |
| `invariant_violation` | `domain-verification` | No | Binding state cannot transition to the requested verification or bound state. |
| `certificate_not_allowed` | `certificate-admission` | No | Binding TLS policy does not allow issuance or renewal. |
| `certificate_attempt_conflict` | `certificate-admission` | No | Duplicate in-flight certificate attempt conflicts with the command. |
| `certificate_provider_unavailable` | `certificate-admission` | Yes | Required certificate provider is unavailable before acceptance. |
| `certificate_import_not_allowed` | `certificate-admission` | No | Binding policy or binding state does not allow manual import. |
| `certificate_import_domain_mismatch` | `certificate-import-validation` | No | Imported certificate does not cover the bound hostname. |
| `certificate_import_key_mismatch` | `certificate-import-validation` | No | Imported private key does not match the leaf certificate. |
| `certificate_import_expired` | `certificate-import-validation` | No | Imported certificate is already expired. |
| `certificate_import_not_yet_valid` | `certificate-import-validation` | No | Imported certificate `notBefore` is in the future. |
| `certificate_import_unsupported_algorithm` | `certificate-import-validation` | No | Imported certificate/key algorithm is not supported by policy. |
| `certificate_import_malformed_chain` | `certificate-import-validation` | No | Imported chain is malformed or cannot be parsed into a valid leaf/intermediate sequence. |
| `certificate_import_storage_failed` | `certificate-import-storage` | Yes | Secret storage or durable state recording failed before import success could be recorded. |
| `infra_error` | persistence, import storage, or event publication phase | Conditional | State or event could not be safely recorded. |

## Async Error Profile

| Error condition | Required representation | Retriable |
| --- | --- | --- |
| DNS ownership not verified | Binding remains not ready; record `code = domain_ownership_unverified`, `phase = domain-verification`. | No until DNS/configuration/evidence changes. |
| DNS lookup/provider unavailable | Binding remains not ready or retry scheduled; record `code = dns_lookup_failed`, `phase = domain-verification`. | Yes when transient. |
| Route realization fails | Binding remains not ready; record `code = route_realization_failed`, `phase = route-realization`. | Yes when proxy/provider can recover. |
| Certificate challenge preparation fails | `certificate-issuance-failed` with `code = certificate_challenge_preparation_failed`, `failurePhase = challenge-preparation`. | No until configuration changes. |
| HTTP-01 challenge token serving misses a token | Challenge route returns `404`; no domain state mutation. Provider validation later maps the CA failure to `certificate_challenge_failed`, `failurePhase = domain-validation`. | No until route/token/DNS configuration changes. |
| Certificate provider request fails | `certificate-issuance-failed` with `code = certificate_provider_unavailable`, `failurePhase = provider-request`. | Yes when transient. |
| Domain validation fails | `certificate-issuance-failed` with `code = certificate_challenge_failed`, `failurePhase = domain-validation`. | No until DNS/binding config changes. |
| Certificate storage fails | `certificate-issuance-failed` with `code = certificate_storage_failed`, `failurePhase = certificate-storage`. | Yes when storage can recover. |
| Imported certificate does not cover the bound hostname | Import command returns `err` with `code = certificate_import_domain_mismatch`, `phase = certificate-import-validation`. | No until certificate material changes. |
| Imported certificate key does not match | Import command returns `err` with `code = certificate_import_key_mismatch`, `phase = certificate-import-validation`. | No until certificate material changes. |
| Imported certificate is expired or not yet valid | Import command returns `err` with `code = certificate_import_expired` or `certificate_import_not_yet_valid`, `phase = certificate-import-validation`. | No until certificate material changes or time crosses the validity window. |
| Imported certificate chain is malformed or algorithm is unsupported | Import command returns `err` with `code = certificate_import_malformed_chain` or `certificate_import_unsupported_algorithm`, `phase = certificate-import-validation`. | No until certificate material changes. |
| Imported certificate secret storage fails | Import command returns `err` with `code = certificate_import_storage_failed`, `phase = certificate-import-storage`. | Yes when storage can recover. |
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

Current runtime planning rejects proxy-backed access routes without domains and rejects domains when `proxyKind = none`. `proxyKind` is provider-selection migration data; target errors use `edgeProxyProviderKey` and proxy-capability phases.

Current runtime adapters can generate Traefik/Caddy labels and public health URLs from deployment runtime plans.

Generated default access route provider errors are governed by ADR-017 and deployment/access-route workflow specs; they must not be represented as durable domain binding verification failures unless a `DomainBinding` exists.

Current `domain-bindings.create` returns structured errors for validation, missing context, active binding conflict, `domain_binding_proxy_required`, and `domain_binding_context_mismatch`.

Current code has durable domain binding state, a domain binding read model, API/CLI list query, and Web console create/list entrypoint for accepted/pending-verification state.

Current code has ownership confirmation through `domain-bindings.confirm-ownership`, including
DNS-gated confirmation, explicit manual override, `domain-bound` publication, and bound-state
read-model visibility.

Current code adds TLS-disabled `domain-ready` state after `domain-bound` and resource access summary
projection for ready durable domain routes.

Current code implements certificate request admission errors for `certificates.issue-or-renew`,
including `not_found` with `certificate-context-resolution`, `certificate_not_allowed` with
`certificate-admission`, and `certificate_attempt_conflict` for duplicate in-flight attempts. It
also persists certificate attempt state and publishes `certificate-requested` only after acceptance.

Current code maps provider and secret-store failures from the `certificate-requested` event handler
into durable failed or retry-scheduled certificate attempt state and publishes
`certificate-issuance-failed` with safe structured error metadata.

Current code consumes `certificate-issued` for certificate-backed domain readiness and publishes
`domain-ready` after the referenced bound domain binding is marked ready.

`certificates.import`, `certificate-imported`, and import-specific validation/storage error mapping
are not implemented yet.

Current code serves HTTP-01 challenge tokens through an injected challenge token store. Missing,
expired, removed, or host-mismatched challenge requests return HTTP `404` and do not mutate
certificate or domain binding state.

Route realization failure state, DNS-provider verification failure state, and import-specific
business-code error mapping are not implemented yet.

## Open Questions

- None for the current routing/domain/TLS error baseline. Domain verification retriability is governed by ADR-006, certificate issuance retriability is governed by ADR-007, renewal triggering is governed by ADR-008, and manual import boundaries are governed by ADR-009.
