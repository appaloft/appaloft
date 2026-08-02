# ADR-104: Certificate Route Activation Reconciliation

Status: Accepted

Date: 2026-08-02

## Context

Appaloft stores provider-issued and imported certificate state, but the current certificate success
event handlers mark eligible `DomainBinding` records ready without activating the selected material
in the edge proxy or observing the certificate served for the hostname. Durable TLS routes can also
select provider-local certificate automation, creating a second lifecycle source of truth.

Certificate policy is accepted at binding creation but cannot be changed later through an
intention-revealing operation. These gaps affect operation identity, lifecycle ownership, readiness,
failure/rollback semantics, secret handling, and provider contracts.

## Decision

1. Add `domain-bindings.configure-certificate-policy` as the sole post-create policy transition
   operation. Route redirection remains owned by `domain-bindings.configure-route`.
2. `certificate-issued` and `certificate-imported` mean selected material was stored. They do not
   prove edge activation and may not directly make a binding ready.
3. The routing/domain/TLS application workflow coordinates certificate reconciliation through
   provider-neutral materialization, edge activation, reload, and TLS observation ports.
4. `domain-ready` for certificate-backed bindings requires a direct TLS handshake using the
   binding hostname as SNI and proof that the served leaf certificate matches the selected expected
   fingerprint, covers the hostname, and is currently valid.
5. Providers atomically replace stable, binding-scoped certificate material and keep a rollback
   copy until the candidate is proven and readiness is durably persisted. They never reconstruct
   the serving workload container. Failure returns safe retriable evidence, preserves the prior
   serving certificate/route and readiness truth, and never exposes raw certificate material.
6. Durable Appaloft-managed/imported routes must not use provider-local certificate automation.
   Provider-local TLS remains an explicit capability for server-applied or other route sources that
   do not claim platform-owned `Certificate` lifecycle.
7. Secret references may cross the application port, but PEM/private key/passphrase values exist
   only inside request-scoped materialization and runtime/provider execution boundaries. They must
   not enter events, logs, process details, public results, or argv.
8. A durable TLS route without a selected Appaloft certificate is certificate-pending. It must not
   fall back to provider-local automation or expose the workload as ready HTTPS. Certificate
   challenge handling remains a separate workflow concern.
9. Certificate route activation resolves the authoritative current route target before mutation:
   binding, latest serving deployment/service/port, server/destination, provider, and previous
   activation identity. Writing files without applying that exact route is not activation success.
10. Reconciliation is serialized per binding and revalidates certificate activity/source, current
    policy, fingerprint, and binding ownership inside the coordination boundary. Certificate id and
    fingerprint form one inseparable durable served-proof pair.

## Consequences

- Domain readiness becomes an externally proven routing fact rather than a storage projection.
- Policy transitions are explicit, reviewable, and shared across CLI/API/SDK/MCP/Web surfaces.
- Provider packages gain certificate activation contracts and tests, while application code stays
  independent of Traefik/Caddy syntax.
- Existing optimistic ready rows require migration/reconciliation and cannot be grandfathered as
  proven without evidence.
- Real Docker TLS smoke becomes an opt-in release-quality proof in addition to hermetic default CI.

## Rejected Alternatives

- Mark ready after persistence only.
- Continue proxy-local ACME for durable platform-owned certificate lifecycle.
- Put raw certificate material in route inputs, events, or public state.
- Replace the serving certificate before candidate proof.
- Add policy to a generic domain-binding update or route-configuration command.

## Governed Sources

- [Certificate Route Activation Reconciliation Spec](../specs/121-certificate-route-activation-reconciliation/spec.md)
- [Routing, Domain Binding, And TLS Workflow](../workflows/routing-domain-and-tls.md)
- [Routing, Domain Binding, And TLS Test Matrix](../testing/routing-domain-and-tls-test-matrix.md)
- [Edge Proxy Provider And Route Configuration Test Matrix](../testing/edge-proxy-provider-and-route-configuration-test-matrix.md)
