# certificates.delete Command Spec

## Normative Contract

`certificates.delete` removes a certificate from Appaloft's visible active lifecycle while retaining
necessary audit history.

It is not revocation. It must not call provider revocation, delete domain bindings, remove generated
access, rewrite deployment snapshots, or erase server-applied route audit.

```ts
type DeleteCertificateResult = Result<{ certificateId: string }, DomainError>;
```

## Input Model

| Field | Requirement | Meaning |
| --- | --- | --- |
| `certificateId` | Required | Certificate to remove from visible active lifecycle. |
| `confirmation.certificateId` | Required | Exact certificate id confirmation. CLI maps this from `--confirm <certificateId>`. |
| `causationId` | Required when event-driven | Event or command id that requested deletion. |

## Admission Flow

The command must:

1. Validate input and exact confirmation.
2. Resolve the certificate.
3. Reject active certificates with `certificate_delete_not_allowed`.
4. Preserve attempts and safe metadata needed for audit.
5. Mark the certificate `deleted`.
6. Publish `certificate-deleted`.
7. Return `ok({ certificateId })`.

## Domain-Specific Error Codes

| Error code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `command-validation` | No | Input or confirmation is invalid. |
| `not_found` | `certificate-context-resolution` | No | Certificate does not exist. |
| `certificate_delete_not_allowed` | `certificate-delete` | No | Certificate is still active for TLS or otherwise not deletable. |
| `infra_error` | `certificate-delete` or `event-publication` | Conditional | State or event could not be safely recorded. |

## Current Implementation Notes And Migration Gaps

Implemented in the certificate lifecycle closure slice for core/application, persistence safe
readback, oRPC/OpenAPI, CLI, Web affordance, and public docs.
