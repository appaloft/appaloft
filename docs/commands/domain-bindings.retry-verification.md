# domain-bindings.retry-verification Command Spec

## Normative Contract

`domain-bindings.retry-verification` creates a new ownership verification attempt for an existing
binding after DNS or evidence changes.

It does not replay old lifecycle events, retry certificate issuance, revoke/delete certificates,
repair proxy routes, or redeploy a resource.

## Input

| Field | Requirement | Meaning |
| --- | --- | --- |
| `domainBindingId` | Required | Binding whose ownership verification should be retried. |
| `idempotencyKey` | Optional | Caller dedupe key. |

## Rules

- Retry creates a new verification attempt id.
- Existing attempts remain historical state.
- DNS observation returns to a waitable pending state when expected targets are known.
- Retry is accepted only while the binding is pending verification or not ready from domain/route
  readiness state.
- Certificate retry remains certificate lifecycle work.

## Errors

| Error code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `command-validation` | No | Input shape is invalid. |
| `not_found` | `domain-verification` | No | Binding does not exist. |
| `domain_verification_not_pending` | `domain-verification` | No | Current binding state is not eligible for ownership verification retry. |
