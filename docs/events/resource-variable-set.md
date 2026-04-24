# resource-variable-set Event Spec

## Normative Contract

`resource-variable-set` records that `resources.set-variable` durably stored or replaced one
resource-scoped variable override.

The event is a durable fact, not proof that a deployment has read the value yet.

## Payload

```ts
type ResourceVariableSetEventPayload = {
  resourceId: string;
  projectId: string;
  environmentId: string;
  variableKey: string;
  variableExposure: "build-time" | "runtime";
  variableKind: string;
  isSecret: boolean;
  configuredAt: string;
  correlationId?: string;
  causationId?: string;
};
```

Payloads must not include plaintext variable values, deployment logs, provider credentials, or
support payload copies.
