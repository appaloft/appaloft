# certificates.show Query Spec

## Normative Contract

`certificates.show` reads one certificate by id and returns safe certificate metadata plus attempt
history needed for operations and troubleshooting.

It must not return raw certificate PEM bodies, private key material, passphrases, secret refs,
provider account data, or raw provider responses.

```ts
type ShowCertificateResult = Result<CertificateSummary, DomainError>;
```

## Input Model

| Field | Requirement | Meaning |
| --- | --- | --- |
| `certificateId` | Required | Certificate to read. |

## Behavior

The query must:

1. Validate input.
2. Read the certificate from the certificate read model or a query-shaped reader.
3. Return `not_found` when the certificate does not exist or is not visible.
4. Return safe metadata for provider-issued and imported certificates.
5. Include latest attempt and historical attempts when the read model supports them.

## Domain-Specific Error Codes

| Error code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `command-validation` | No | Certificate id is missing or malformed. |
| `not_found` | `certificate-context-resolution` | No | Certificate does not exist or is not visible. |

## Handler Boundary

The handler must delegate to a query service and return typed `Result`. It must not mutate state.

## Current Implementation Notes And Migration Gaps

Implemented in the certificate lifecycle closure slice for safe certificate metadata and attempt
history readback.
