# certificates.revoke Command Spec

## Normative Contract

`certificates.revoke` makes an active certificate no longer usable for Appaloft-managed TLS.

Provider-issued certificates coordinate through the certificate provider boundary when provider
revocation is supported. Imported certificates are revoked locally in Appaloft because Appaloft did
not issue them and may not have authority to revoke them with the external CA.

```ts
type RevokeCertificateResult = Result<{ certificateId: string }, DomainError>;
```

## Input Model

| Field | Requirement | Meaning |
| --- | --- | --- |
| `certificateId` | Required | Certificate to revoke from Appaloft TLS use. |
| `reason` | Optional | Safe operator reason; must not contain secrets. |
| `idempotencyKey` | Optional | Caller-supplied dedupe key. |
| `causationId` | Required when event-driven | Event or command id that requested revocation. |

## Admission Flow

The command must:

1. Validate input.
2. Resolve the certificate.
3. Treat already revoked/deleted certificates idempotently.
4. Reject certificates that have no active TLS usability with `certificate_revoke_not_allowed` when
   idempotency is not applicable.
5. For managed certificates, call provider-neutral revocation when available.
6. For imported certificates, skip provider revocation and record Appaloft-local revocation.
7. Request secret-store deactivation when supported without exposing secret refs.
8. Persist `status = revoked`.
9. Publish `certificate-revoked`.
10. Return `ok({ certificateId })`.

## Domain-Specific Error Codes

| Error code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `command-validation` | No | Input is invalid. |
| `not_found` | `certificate-context-resolution` | No | Certificate does not exist. |
| `certificate_revoke_not_allowed` | `certificate-admission` | No | Certificate state cannot be revoked. |
| `certificate_provider_unavailable` | `provider-request` | Yes | Provider revocation is required but unavailable. |
| `certificate_revoke_failed` | `provider-request` or `certificate-storage` | Conditional | Provider or secret-store revoke/deactivation failed safely. |

## Current Implementation Notes And Migration Gaps

Implemented in the certificate lifecycle closure slice for managed provider-boundary revocation and
imported Appaloft-local revocation. Live CA-specific revocation remains provider-adapter specific
behind the provider-neutral port.
