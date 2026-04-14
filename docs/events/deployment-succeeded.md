# deployment-succeeded Event Spec

## Normative Contract

`deployment-succeeded` means a deployment attempt reached terminal success and the deployment state has been durably persisted as successful.

It does not mean every event consumer, notification, audit projection, or downstream workflow has completed.

`deployment-succeeded` is the canonical terminal success event for the target model.

## Event Type

Domain event for the `Deployment` aggregate, with optional integration-event copies published through an outbox.

During migration, this event may be derived from the current generic `deployment.finished` event when `payload.status === "succeeded"`.

## Trigger

Publish after:

1. deployment execution completes successfully;
2. aggregate state transition to `succeeded` succeeds;
3. terminal success state is durably persisted.

## Publisher

Target publisher: `Deployment` aggregate records the event; application layer publishes it after persistence, preferably through an outbox.

## Consumers

Expected consumers:

- deployment read-model projection;
- notification/audit;
- release promotion or follow-up workflow;
- observability/metrics projection.

## Payload

```ts
type DeploymentSucceededPayload = {
  deploymentId: string;
  projectId: string;
  environmentId: string;
  resourceId: string;
  serverId: string;
  destinationId: string;
  runtimePlanId: string;
  finishedAt: string;
  exitCode: number;
  correlationId?: string;
  causationId?: string;
};
```

## State Progression

Required state transition:

```text
running -> succeeded
```

The event must not be emitted merely because a worker returned without throwing. It must correspond to persisted aggregate state.

## Idempotency

Consumers must dedupe by exact event id when available, otherwise by `(deploymentId, "deployment-succeeded")`.

Duplicate success events must not duplicate release promotion, notification, billing, or follow-up workflow effects.

## Ordering

`deployment-succeeded` must follow `deployment-started`.

It is mutually exclusive with `deployment-failed` for the same deployment attempt.

## Retry And Failure Handling

Consumer failure to process this event must be tracked as event-processing failure. It must not change deployment state from succeeded to failed.

## Current Implementation Notes And Migration Gaps

Current code records `deployment.finished` with payload:

```ts
type CurrentDeploymentFinishedPayload = {
  status: "succeeded" | "failed" | "rolled-back";
  exitCode: number;
  retryable: boolean;
  errorCode?: string;
};
```

For now, `deployment-succeeded` can be treated as a canonical projection of `deployment.finished/status=succeeded`. The implementation should eventually split this into a first-class event or a stable derived event contract.
