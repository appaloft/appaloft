# ADR-093: Tunnel Session Lifecycle

Status: Accepted

Date: 2026-07-20

## Context

Local and self-hosted users need temporary public access without first configuring DNS and TLS.
This is not a durable `DomainBinding`, general DNS management, or a deployment admission field.

## Decision

A `TunnelSession` is application-owned short-lived ingress state for an explicit local origin. It
has provider, owner, origin, public URL, status, expiry, provider handle, process identity, and
revocation timestamps. Provider-specific payloads remain behind `TunnelProviderPort`.

Public operations are `tunnels.start`, `tunnels.list`, `tunnels.show`, and `tunnels.revoke`.
`start` requires an authorized actor, loopback/private origin by default, bounded expiry, and a
registered provider. `revoke` is idempotent and must terminate provider/process state before
marking the session revoked. A disabled-by-default reconciler expires due sessions and cleans
orphaned provider processes.

Initial neutral provider keys are `cloudflare-quick` and `ngrok`. Public adapters may invoke their
local agents, but credentials, command lines containing credentials, provider raw output, and
private tokens are never persisted or returned. A generated hostname is readback, not a
`DomainBinding`; custom-domain ownership remains under the existing domain workflow.

## Consequences

- Tunnel lifecycle does not modify Deployment or Resource aggregates.
- Cloudflare Quick Tunnel and ngrok share one start/status/revoke contract.
- Every session can be inspected, expires, and can be explicitly revoked and cleaned up.

## Governed Specs

- [Tunnel Session Lifecycle](../specs/110-tunnel-session-lifecycle/spec.md)
- [Tunnel Session Test Matrix](../testing/tunnel-session-test-matrix.md)
- [External Edge Access And DNS](../specs/075-external-edge-access-and-dns/spec.md)
