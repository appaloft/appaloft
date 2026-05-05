# dependency-resource-realization-failed Event Spec

## Intent

Record that provider-native dependency resource realization failed after command admission.

## Publisher

The dependency resource realization use case after degraded state, blocked binding readiness, and
sanitized failure metadata are durably persisted.

## Payload

- `dependencyResourceId`
- `providerKey`
- `attemptId`
- `failureCode`

## Semantics

The original provision command remains accepted. Operators inspect `dependency-resources.show` for
safe failure status and retryability once retry is specified.

## Safety

Payloads must not include raw provider output, provider SDK responses, credentials, passwords,
tokens, private keys, or raw connection material.
