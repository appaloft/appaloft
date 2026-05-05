# dependency-resource-provider-delete-requested Event Spec

## Intent

Record that Appaloft requested provider cleanup for a realized managed dependency resource after
delete safety passed.

## Publisher

`dependency-resources.delete` after delete safety passes and the provider delete attempt is durably
recorded.

## Payload

- `dependencyResourceId`
- `providerKey`
- `attemptId`

## Semantics

The event means provider cleanup was requested. The dependency resource is tombstoned only after
cleanup succeeds and the delete state is persisted.

## Safety

Payloads must not include raw provider output, provider credentials, passwords, tokens, private
keys, raw connection strings, or command output.
