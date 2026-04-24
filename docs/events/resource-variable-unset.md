# resource-variable-unset Event Spec

## Normative Contract

`resource-variable-unset` records that `resources.unset-variable` durably removed one
resource-scoped variable override.

## Payload

```ts
type ResourceVariableUnsetEventPayload = {
  resourceId: string;
  projectId: string;
  environmentId: string;
  variableKey: string;
  variableExposure: "build-time" | "runtime";
  removedAt: string;
  correlationId?: string;
  causationId?: string;
};
```

Payloads must not include plaintext variable values.
