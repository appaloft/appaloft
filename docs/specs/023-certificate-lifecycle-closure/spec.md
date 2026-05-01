# Certificate Lifecycle Closure

## Status

- Round: Post-Implementation Sync
- Artifact state: implemented and verified for certificate show/retry/revoke/delete closure

## Business Outcome

Operators can inspect, retry, revoke, and delete managed certificate records without confusing those
actions with domain binding deletion or deployment route snapshots.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Certificate show | Safe readback of one certificate and attempts. | Routing/domain/TLS | None |
| Certificate retry | New provider-issued attempt created from latest retryable managed failure. | Routing/domain/TLS | Scheduler retry is internal |
| Certificate revoke | Stop Appaloft from using a certificate for TLS. | Routing/domain/TLS | None |
| Certificate delete | Remove visible active lifecycle while retaining audit history. | Routing/domain/TLS | None |
| Provider-issued certificate | Certificate with `source = managed`. | Routing/domain/TLS | Managed certificate |
| Imported certificate | Certificate with `source = imported`. | Routing/domain/TLS | Manual certificate |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| CERT-LIFE-AC-001 | Show provider-issued certificate | A managed certificate exists with attempts | `certificates.show` runs | Safe metadata and attempt state are returned without secret material |
| CERT-LIFE-AC-002 | Show imported certificate | An imported certificate exists | `certificates.show` runs | Imported safe metadata is returned without PEM/private key/passphrase/secret refs |
| CERT-LIFE-AC-003 | Retry provider-issued failure | Latest managed attempt is retryable | `certificates.retry` runs | A new attempt id is created through issue/renew semantics and `certificate-requested` is published |
| CERT-LIFE-AC-004 | Retry imported certificate | Certificate source is imported | `certificates.retry` runs | Command rejects with `certificate_retry_not_allowed`; user must import replacement material |
| CERT-LIFE-AC-005 | Revoke provider-issued certificate | Active managed certificate exists | `certificates.revoke` runs | Provider boundary is invoked when supported, certificate becomes `revoked`, and `certificate-revoked` is recorded |
| CERT-LIFE-AC-006 | Revoke imported certificate | Active imported certificate exists | `certificates.revoke` runs | No provider issuance/revocation call is made; Appaloft marks the certificate `revoked` locally |
| CERT-LIFE-AC-007 | Delete revoked certificate | Certificate is revoked, failed, expired, disabled, or already non-active | `certificates.delete` runs with exact confirmation | Certificate becomes `deleted`, safe audit remains, and `certificate-deleted` is recorded |
| CERT-LIFE-AC-008 | Delete active certificate | Certificate is active | `certificates.delete` runs | Command rejects with `certificate_delete_not_allowed`; it does not revoke implicitly |
| CERT-LIFE-AC-009 | Domain binding delete separation | A binding has active certificate state | `domain-bindings.delete` runs | It remains blocked; certificate revoke/delete must be explicit certificate operations |

## Domain Ownership

- Bounded context: Routing/domain/TLS
- Aggregate/resource owner: `Certificate`
- Upstream/downstream contexts: `DomainBinding` supplies ownership context; certificate provider and
  secret store are provider/infrastructure boundaries.

## Public Surfaces

- API: add show, retry, revoke, and delete endpoints under `/api/certificates`.
- CLI: add `certificate show`, `certificate retry`, `certificate revoke`, and `certificate delete`.
- Web/UI: resource-scoped certificate affordances for show/readback and guarded lifecycle actions.
- Config: not applicable.
- Events: add `certificate-revoked` and `certificate-deleted`; retry emits `certificate-requested`.
- Public docs/help: existing certificate readiness docs get lifecycle operation notes and stable
  anchors.

## Non-Goals

- Domain binding delete must not revoke/delete certificates.
- Certificate retry must not retry domain ownership verification.
- Delete must not erase necessary audit history or deployment snapshots.
- Revoke/delete must not expose raw certificate material or private keys.
- Live CA revocation integration beyond provider-neutral port support is not required for the
  hermetic first closure slice.

## ADR Need

ADR-035 is required and accepted because this slice adds public operation identity, durable state
values, event facts, and provider/secret-store lifecycle boundaries.

## Open Questions

- None for the first closure slice.
