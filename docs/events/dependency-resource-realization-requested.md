# dependency-resource-realization-requested Event Spec

## Intent

Record that Appaloft accepted provider-native realization for a managed dependency resource.

## Publisher

`dependency-resources.provision-postgres`, and future `dependency-resources.provision-redis`, after
the `ResourceInstance` and realization attempt are durably persisted.

## Payload

- `dependencyResourceId`
- `providerKey`
- `attemptId`

## Semantics

The event means realization was requested, not that provider creation succeeded. Consumers must read
dependency resource state for current status and must not infer readiness from this event alone.

## Safety

Payloads must not include raw connection strings, passwords, provider credentials, provider SDK
responses, private keys, tokens, or command output.
