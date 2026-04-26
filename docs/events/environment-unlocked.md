# environment-unlocked Event Spec

## Kind

Domain event.

## Producer

`Environment` aggregate during `environments.unlock`.

## Trigger

A locked environment transitions to active.

## Payload

```ts
type EnvironmentUnlockedPayload = {
  environmentId: string;
  projectId: string;
  environmentName: string;
  environmentKind: string;
  unlockedAt: string;
};
```

Payload must not include secret variable values, provider credentials, deployment logs, or raw
configuration values.

## Publication Boundary

The event is published after the environment state is persisted. If persistence fails, the event
must not be published.

## Consumers

Current consumers are read-model/audit oriented. Handlers must not decide whether the original
unlock transition was allowed.

## Tests

Covered by `ENV-LIFE-UNLOCK-001`, `ENV-LIFE-UNLOCK-003`, and `ENV-LIFE-PERSIST-002` rows in
[Environment Lifecycle Test Matrix](../testing/environment-lifecycle-test-matrix.md).
