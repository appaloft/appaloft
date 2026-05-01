# certificates.retry Command Spec

## Normative Contract

`certificates.retry` creates a new provider-issued certificate attempt from the latest retryable
managed failure.

Command success means the retry request was accepted and a new attempt id exists. It does not mean
the certificate was issued.

```ts
type RetryCertificateResult = Result<{ certificateId: string; attemptId: string }, DomainError>;
```

## Input Model

| Field | Requirement | Meaning |
| --- | --- | --- |
| `certificateId` | Required | Certificate whose latest retryable managed failure should be retried. |
| `idempotencyKey` | Optional | Caller-supplied dedupe key for the retry attempt. |
| `causationId` | Required when event-driven | Event or command id that requested retry. |

## Admission Flow

The command must:

1. Validate input.
2. Resolve the certificate.
3. Reject imported certificates with `certificate_retry_not_allowed`.
4. Reject certificates whose latest attempt is not retryable with `certificate_retry_not_allowed`.
5. Reject duplicate in-flight retry attempts for the same reason unless idempotency matches.
6. Dispatch the same issue/renew use-case path with the failed attempt's reason, provider key, and
   challenge type.
7. Persist a new attempt and publish `certificate-requested`.
8. Return `ok({ certificateId, attemptId })`.

Retry must not replay old events and must not retry domain ownership verification.

## Domain-Specific Error Codes

| Error code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `command-validation` | No | Certificate id or idempotency key is invalid. |
| `not_found` | `certificate-context-resolution` | No | Certificate does not exist. |
| `certificate_retry_not_allowed` | `certificate-admission` | No | Certificate source/status/latest attempt does not allow public retry. |
| `certificate_attempt_conflict` | `certificate-admission` | No | A newer in-flight attempt already exists. |

## Current Implementation Notes And Migration Gaps

Implemented in the certificate lifecycle closure slice. The existing retry scheduler remains an
internal process capability and is not a public entrypoint.
