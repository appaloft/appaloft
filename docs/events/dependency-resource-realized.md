# dependency-resource-realized Event Spec

## Intent

Record that provider-native dependency resource realization completed with safe provider metadata.

## Publisher

The dependency resource realization use case after safe provider handle, masked endpoint metadata,
and binding readiness are durably persisted.

## Payload

- `dependencyResourceId`
- `providerKey`
- `providerResourceHandle`
- `attemptId`

## Semantics

The event means the managed dependency resource is ready for write-side binding admission. It does
not mean any workload has received runtime environment values.

## Safety

Payloads must not include raw connection strings, passwords, provider credentials, provider SDK
responses, private keys, tokens, or command output.
