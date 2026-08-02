# Discovery: Certificate Route Activation Reconciliation

## Actor And Outcome

An operator can move a durable custom domain between Appaloft-managed and imported certificate
policy without an interval where Appaloft reports the domain ready while the edge proxy is still
serving an older or provider-local certificate.

## Existing Evidence

- `Certificate` already owns provider-issued and imported material metadata and secret references.
- `DomainBinding` already owns durable hostname, TLS mode, certificate policy, and readiness.
- `certificate-issued` and `certificate-imported` currently make an eligible binding ready directly.
- `EdgeProxyRouteInput` does not identify the Appaloft-managed certificate that must serve a route.
- Traefik and Caddy currently implement TLS-auto as provider-local certificate automation.
- `EDGE-PROXY-RELOAD-004` requires certificate-backed proxy activation before `domain-ready`, but no
  executable test is bound to it.
- `domain-bindings.create` accepts certificate policy, but there is no intention-revealing
  post-create operation for changing it.

## Constraints

- Public Appaloft owns the provider-neutral lifecycle, operation, ports, status, and proof contract.
- Certificate material stays behind secret-storage/materialization boundaries and never enters
  events, read models, logs, command results, CLI argv, or public diagnostics.
- Provider adapters own Traefik/Caddy configuration shape. Application code must not branch on a
  concrete proxy product.
- A candidate certificate may not replace the last known serving certificate until activation and
  direct hostname/SNI proof succeed.
- `domain-ready` means the selected certificate is observed at the edge, not merely stored.
- Provider-local TLS remains valid for server-applied routes, but not for durable Appaloft-managed
  `DomainBinding` certificate lifecycle.

## Owner-Confirmed Decisions

| # | Topic | Decision |
| --- | --- | --- |
| 1 | Operation identity | Add `domain-bindings.configure-certificate-policy`; do not expand generic route configuration or add a generic update command. |
| 2 | Activation owner | Add a provider-neutral certificate route activation boundary coordinated by the routing/domain/TLS application workflow. |
| 3 | Secret handling | The activation boundary receives opaque secret references and a request-scoped materialization capability; raw material stays inside the runtime/provider adapter. |
| 4 | Readiness | `certificate-issued` and `certificate-imported` request reconciliation. Only successful apply/reload plus served-certificate proof may emit `domain-ready`. |
| 5 | Proof | Direct TLS handshake uses the binding hostname as SNI and verifies the served leaf fingerprint, hostname coverage, and validity window against the selected certificate. |
| 6 | Failure safety | Apply and prove a candidate before retiring the prior serving certificate. Failure preserves the prior route/certificate and records safe not-ready/retriable evidence. |
| 7 | Policy transition | `auto -> manual` waits for a successful import and activation; `manual -> auto` waits for successful issuance and activation; `disabled` requires TLS-disabled binding semantics and never silently downgrades HTTPS. |
| 8 | Provider behavior | Durable managed/manual routes do not request Traefik/Caddy provider-local certificate automation. Provider-local automation remains available only to explicitly provider-local route sources. |
| 9 | Test seams | Test the public operation/event workflow, provider contracts, and opt-in real Docker hostname/SNI fingerprint smoke. |
| 10 | Docs | Update the existing bilingual certificate-readiness page and registry topic; explain pending activation and preservation of the previous serving certificate. |

The owner confirmed this scope and authorized Spec, Ticket, and Code on 2026-08-02.

## Rejected Options

- Mark ready immediately after secret storage: it cannot prove which certificate the proxy serves.
- Put raw PEM in `EdgeProxyRouteInput` or events: it leaks secrets across observable boundaries.
- Let durable routes continue using proxy-local ACME: it contradicts platform-owned certificate
  lifecycle and creates two sources of truth.
- Replace the active certificate before proof: a failed reload or invalid candidate would cause an
  avoidable outage.
- Add certificate fields to `domain-bindings.configure-route`: it mixes routing intent with a
  separate certificate-policy transition.

## Open Questions

None for the governed first implementation slice.
