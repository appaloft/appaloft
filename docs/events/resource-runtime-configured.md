# resource-runtime-configured Event Spec

## Normative Contract

`resource-runtime-configured` records that `resources.configure-runtime` durably replaced a
resource's runtime planning profile.

The event is a durable fact, not proof that a runtime plan can be built, deployed, started, or
served.

## Payload

```ts
type ResourceRuntimeConfiguredEventPayload = {
  resourceId: string;
  projectId: string;
  environmentId: string;
  runtimePlanStrategy: string;
  configuredAt: string;
  correlationId?: string;
  causationId?: string;
};
```

Payloads must not include command output, environment secret values, provider credentials, build
logs, runtime logs, or filesystem absolute host paths.

## Consumers

Consumers may update resource read models, audit trails, and profile diagnostics. They must not
start deployments, build images, restart runtime, mutate health policy, or apply proxy routes.

## Error Handling

Producer failures before command success use `phase = event-publication` in
[Resource Lifecycle Error Spec](../errors/resources.lifecycle.md).

Consumer failures use `phase = event-consumption` and must not reinterpret the original command
result.
