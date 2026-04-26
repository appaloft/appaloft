# environment-locked Event Spec

## Kind

Domain event.

## Producer

`Environment` aggregate during `environments.lock`.

## Trigger

An active environment transitions to locked.

## Payload

```ts
type EnvironmentLockedPayload = {
  environmentId: string;
  projectId: string;
  environmentName: string;
  environmentKind: string;
  lockedAt: string;
  reason?: string;
};
```

Payload must not include secret variable values, provider credentials, deployment logs, or raw
configuration values.

## Publication Boundary

The event is published after the environment state is persisted. If persistence fails, the event
must not be published.

## Consumers

Current consumers are read-model/audit oriented. Handlers must not decide whether the original lock
transition was allowed.

## Tests

Covered by `ENV-LIFE-LOCK-001`, `ENV-LIFE-LOCK-003`, and `ENV-LIFE-PERSIST-002` rows in
[Environment Lifecycle Test Matrix](../testing/environment-lifecycle-test-matrix.md).
