# resource-source-configured Event Spec

## Normative Contract

`resource-source-configured` records that `resources.configure-source` durably replaced a
resource's source binding.

The event is a durable fact, not proof that source can be cloned, inspected, built, deployed, or
served.

## Payload

```ts
type ResourceSourceConfiguredEventPayload = {
  resourceId: string;
  projectId: string;
  environmentId: string;
  sourceKind: string;
  sourceLocator?: string;
  configuredAt: string;
  correlationId?: string;
  causationId?: string;
};
```

Payloads must not include source credentials, tokens, deploy keys, SSH private keys, registry
passwords, raw provider access material, or local absolute host paths.

## Consumers

Consumers may update resource read models, audit trails, and profile diagnostics. They must not
start deployments, pull source, run detection, rebuild artifacts, or retarget source links.

## Error Handling

Producer failures before command success use `phase = event-publication` in
[Resource Lifecycle Error Spec](../errors/resources.lifecycle.md).

Consumer failures use `phase = event-consumption` and must not reinterpret the original command
result.
