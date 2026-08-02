# Certificate Route Activation Reconciliation

## Status

- Round: Spec complete; Ticket required before Code
- Artifact state: ready-for-ticket
- Compatibility: additive public operation plus backward-compatible readiness correction

## Business Outcome

Operators can select automatic or imported certificate lifecycle for an existing durable custom
domain and trust that `ready` means the edge proxy actually serves the selected certificate for the
hostname.

## Ubiquitous Language

| Term | Meaning |
| --- | --- |
| Certificate policy transition | An explicit change to the certificate lifecycle selected by a `DomainBinding`. |
| Candidate certificate | Stored certificate material selected for activation but not yet proven at the edge. |
| Serving certificate | The certificate currently observed from the edge for the binding hostname and SNI. |
| Certificate route activation | Provider-neutral apply/reload work that makes a candidate available to the route. |
| Served-certificate proof | Direct TLS observation that verifies hostname, validity, and expected leaf fingerprint. |
| Certificate reconciliation | Activation followed by served-certificate proof and readiness transition. |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| CERT-RECON-AC-001 | Imported certificate activation | A bound manual-policy domain and valid imported material | import completes | Material is activated and proven by hostname/SNI before `domain-ready`. |
| CERT-RECON-AC-002 | Managed certificate activation | A bound auto-policy domain and issued certificate | issuance completes | The Appaloft-managed certificate is activated and proven before `domain-ready`; provider-local ACME is not selected for the durable route. |
| CERT-RECON-AC-003 | Activation failure | A previous certificate still serves and candidate activation/reload fails | reconciliation runs | The previous serving configuration remains, the binding is not marked ready for the candidate, and safe retriable failure evidence is observable. |
| CERT-RECON-AC-004 | Served fingerprint mismatch | Apply/reload succeeds but the TLS handshake returns another certificate | proof runs | Reconciliation fails closed; no `domain-ready` is emitted and the mismatch exposes no PEM/private key. |
| CERT-RECON-AC-005 | Auto to manual | A durable auto-policy binding exists | policy is configured as manual | Binding awaits a new imported certificate and successful reconciliation; existing serving certificate remains until replacement proof passes. |
| CERT-RECON-AC-006 | Manual to auto | A durable manual-policy binding exists | policy is configured as auto | Binding awaits managed issuance and successful reconciliation; existing serving certificate remains until replacement proof passes. |
| CERT-RECON-AC-007 | Idempotent reconciliation | The selected certificate fingerprint is already proven for the route | the event or worker repeats | No duplicate destructive apply occurs and readiness remains converged. |
| CERT-RECON-AC-008 | Provider contract | A durable route selects Appaloft-managed or imported certificate lifecycle | Traefik or Caddy renders it | Provider-local certificate automation is absent and provider-owned dynamic certificate activation is used. |
| CERT-RECON-AC-009 | Real SNI proof | A real local Traefik or Caddy fixture has old and candidate certificates | reconciliation runs | A direct TLS client using the hostname as SNI observes the candidate fingerprint before readiness. |
| CERT-RECON-AC-010 | Certificate-pending route | A durable TLS binding has no selected Appaloft certificate | its route intent is rendered | The workload is not exposed as ready HTTPS and provider-local automation is absent; challenge handling remains separate. |
| CERT-RECON-AC-011 | Authoritative activation target | A selected candidate must replace the serving certificate | reconciliation resolves its target | Activation uses the current binding plus latest serving deployment/service/port and prior activation identity; missing or stale target facts fail closed before mutation. |

## Domain Ownership

- Bounded context: Routing/domain/TLS.
- `DomainBinding` owns certificate policy and route readiness.
- `Certificate` owns certificate lifecycle and selected material references.
- The application workflow owns cross-aggregate reconciliation.
- Secret-store, runtime-target, edge-proxy provider, and TLS observer adapters form the
  anticorruption boundary to concrete storage, hosts, and proxies.

## Public Surfaces

- API/oRPC: add `domain-bindings.configure-certificate-policy`.
- CLI: add `appaloft domain-binding configure-certificate-policy <id> --policy auto|manual`.
- Web/UI: expose policy selection and pending/failed activation status on the resource/domain view.
- SDK/MCP: generated from the same operation schema and catalog metadata.
- Events: add a certificate-reconciliation fact only if needed for durable observation; do not
  reinterpret `certificate-issued` or `certificate-imported` as proof of edge activation.
- Public docs/help: update `certificate.readiness` at
  `/docs/access/certificates/#certificate-readiness` in both locales.

## Compatibility

- Compatibility impact: minor because the policy transition is an additive public operation.
- Correcting false `domain-ready` is backward-compatible but may leave previously optimistic
  bindings pending/not-ready until edge proof succeeds.
- Server-applied provider-local TLS behavior is unchanged.

## Non-Goals

- DNS-01, wildcard certificate issuance, external CDN certificate orchestration, or browser trust
  policy.
- Exposing raw certificate material or secret references through public contracts.
- Making deployment admission own domain or certificate lifecycle.
- Removing provider-local TLS from server-applied or generated routes that explicitly select it.

## Open Questions

- Swarm certificate distribution remains a deferred runtime-target capability and may not advertise
  certificate activation until its target-specific atomic distribution contract is implemented.
