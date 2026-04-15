# ADR-007: Certificate Provider And Challenge Default

Status: Accepted

Date: 2026-04-14

## Decision

The first platform-owned certificate provider is an ACME provider with HTTP-01 challenge as the default challenge type.

The default provider key is `acme`. Production/staging endpoint selection, account registration, and provider credentials must be explicit adapter configuration, not hidden in the domain model.

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

`certificates.issue-or-renew` should default to:

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

Current code has `tlsMode` and runtime proxy labels, but no platform-owned certificate provider, certificate state, ACME account model, or challenge flow.

## Superseded Open Questions

- Which certificate provider should be the default for first implementation?
- Should the first certificate provider use HTTP-01, DNS-01, or provider-specific default challenges?
- Which first certificate provider and challenge type should contract tests assume?
- Should certificate fingerprint be mandatory in the event payload once provider integration exists?
