# resource-health-policy-reset Event Spec

## Purpose

`resource-health-policy-reset` records that a Resource-owned reusable health policy was cleared.

## Producer

- `resources.reset-health`

## Payload

```ts
type ResourceHealthPolicyResetPayload = {
  resourceId: string;
  projectId: string;
  environmentId: string;
  resetAt: string;
};
```

## Consumers

Current consumers are event log, audit/diagnostic projections, and future health-profile history
views. Runtime target adapters, deployment admission, route providers, and health probe runners do
not consume this event directly.

## Rules

- The event is emitted only after the Resource aggregate accepts the reset.
- It does not imply current runtime health changed.
- It does not rewrite historical deployment snapshots.
- It carries no probe response bodies, credentials, headers, secret values, deployment logs, or
  provider-native details.
