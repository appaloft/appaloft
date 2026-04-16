# ADR-007: Certificate Provider And Challenge Default

Status: Accepted

Date: 2026-04-14

## Decision

The first platform-owned certificate provider is an ACME provider with HTTP-01 challenge as the default challenge type.

The default provider key is `acme`. Production/staging endpoint selection, account registration, and provider credentials must be explicit adapter configuration, not hidden in the domain model.

`acme` and `http-01` are composition/provider configuration defaults, not core or application use-case defaults. The core certificate model must store an opaque provider key and challenge type chosen by an injected provider selection policy; it must not contain ACME-specific branching, account semantics, endpoint configuration, or default-provider selection.

DNS-01, wildcard certificates, and provider-specific managed certificates are deferred capabilities.

## Context

ADR-002 separates durable certificate lifecycle from deployment route snapshots and generated default access routes. Runtime proxy behavior can expose TLS routes, but a platform-owned `Certificate` lifecycle needs explicit provider and challenge semantics.

HTTP-01 aligns with proxy-backed public domains and avoids requiring DNS provider write permissions for the first implementation. DNS-01 remains important for wildcard domains and environments where HTTP challenge cannot be routed reliably.

## Options Considered

| Option | Rule | Result |
| --- | --- | --- |
| ACME + HTTP-01 | Use an ACME provider adapter and HTTP challenge through the platform route/proxy path. | Accepted. |
| ACME + DNS-01 | Use ACME with DNS provider integration for TXT challenges. | Deferred. Requires DNS credentials and provider adapters. |
| Runtime proxy managed certificates | Let Caddy/Traefik obtain certificates without platform certificate state. | Rejected for durable certificate specs. It hides lifecycle state from the platform. |
| Manual certificate only | Require operators to import certs and skip issuance. | Deferred as separate import command. |

## Chosen Rule

The composition/provider policy for `certificates.issue-or-renew` should default to:

- `providerKey = acme`;
- `challengeType = http-01`;
- one certificate attempt per domain binding and reason;
- sanitized provider error mapping into `certificate-issuance-failed`;
- certificate private key and material stored only through approved secret storage;
- event payloads containing certificate ids, attempt ids, safe timestamps, provider key, and optional fingerprint, but never private key material.

HTTP-01 may be used only when the domain binding route can serve the challenge path. If route realization cannot support HTTP-01, admission must reject the request or choose a configured non-default challenge type.

Certificate failure retry rules:

- provider unavailable, network timeout, rate limit, and transient certificate storage failures are retriable; rate-limit failures must include `retryAfter` when known.
- challenge preparation configuration errors and unsupported challenge/provider combinations are non-retriable until configuration changes.
- domain validation or HTTP-01 challenge validation failure is non-retriable until DNS, route, or binding configuration changes.
- certificate fingerprint is optional in `certificate-issued` payloads. It must be included when the provider or storage boundary can supply it safely.

## Consequences

The first certificate workflow can be implemented without DNS provider write access.

The platform owns certificate attempt state and event semantics instead of relying on hidden proxy behavior.

Some domain use cases remain unsupported until DNS-01 or manual import is added, including wildcard certificates and domains where HTTP-01 cannot be publicly routed.

## Governed Specs

- [certificates.issue-or-renew Command Spec](../commands/certificates.issue-or-renew.md)
- [certificate-requested Event Spec](../events/certificate-requested.md)
- [certificate-issued Event Spec](../events/certificate-issued.md)
- [certificate-issuance-failed Event Spec](../events/certificate-issuance-failed.md)
- [Routing, Domain Binding, And TLS Workflow Spec](../workflows/routing-domain-and-tls.md)
- [Routing, Domain Binding, And TLS Error Spec](../errors/routing-domain-tls.md)
- [Routing, Domain Binding, And TLS Test Matrix](../testing/routing-domain-and-tls-test-matrix.md)
- [certificates.issue-or-renew Implementation Plan](../implementation/certificates.issue-or-renew-plan.md)

## Current Implementation Notes And Migration Gaps

Current code has `tlsMode`, runtime proxy labels, platform-owned certificate request state,
`certificates.issue-or-renew`, `certificates.list`, `certificate-requested` publication, and a
provider-neutral `certificate-requested` event handler.

The ACME default lives in the shell composition's provider selection policy. Application use cases
depend only on the `CertificateProviderSelectionPolicy` interface. Core receives only the selected
provider key and challenge type as opaque values.

Current code includes HTTP-01 challenge token serving, certificate-backed domain readiness, and a
real ACME provider adapter under `packages/providers/certificate-acme`.

The ACME provider adapter lives under `packages/providers/*`, depends inward on application ports,
and keeps ACME client SDK types, account-key configuration, ACME order callbacks, and CA endpoint
selection out of core/application.

Shell composition wires the real ACME adapter only when explicit certificate-provider configuration
is present. The default development/test shell profile must not contact a real CA and still records
retryable `certificate_provider_unavailable` state after accepted requests when ACME is not
configured.

Proxy reload is implemented through edge-proxy provider descriptors and runtime reload plans. Retry
scheduler execution is implemented as a separate process-manager capability for retriable
certificate attempts.

## Superseded Open Questions

- Which certificate provider should be the default for first implementation?
- Should the first certificate provider use HTTP-01, DNS-01, or provider-specific default challenges?
- Which first certificate provider and challenge type should contract tests assume?
- Should certificate fingerprint be mandatory in the event payload once provider integration exists?
