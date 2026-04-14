# deployment-started Event Spec

## Normative Contract

`deployment-started` means a deployment attempt has entered runtime rollout/execution.

It does not mean the rollout has completed successfully.

## Event Type

Domain event for the `Deployment` aggregate, with optional integration-event copies published through an outbox.

## Trigger

Publish after:

1. the deployment request has been accepted;
2. any required build/package step has completed or been skipped;
3. deployment state transitions to `running`;
4. the running state is durably persisted.

## Publisher

Target publisher: `Deployment` aggregate records the event; application layer publishes it after persistence.

## Consumers

Expected consumers:

- deployment read-model projection;
- runtime monitoring;
- audit/notification;
- process manager if runtime execution is event-driven.

## Payload

```ts
type DeploymentStartedPayload = {
  deploymentId: string;
  projectId: string;
  environmentId: string;
  resourceId: string;
  serverId: string;
  destinationId: string;
  runtimePlanId: string;
  startedAt: string;
  correlationId?: string;
  causationId?: string;
};
```

## State Progression

Required state transition:

```text
planned -> running
```

If the target workflow introduces build states, `deployment-started` should occur after build/package is complete or skipped.

## Idempotency

Consumers must dedupe by exact event id when available, otherwise by `(deploymentId, "deployment-started")`.

Duplicate `deployment-started` must not trigger duplicate runtime rollout.

## Ordering

Required order:

```text
deployment-requested
  -> build-requested, when required
  -> deployment-started
  -> deployment-succeeded | deployment-failed
```

## Retry And Failure Handling

Consumer failure must be tracked as event-processing failure. It must not be confused with deployment runtime failure.

## Current Implementation Notes And Migration Gaps

Current code records `deployment.started` with an empty payload when `Deployment.start(...)` transitions the aggregate to `running`. The use case persists the aggregate and publishes pulled events before calling the execution backend.

The target spec uses `deployment-started` as the canonical public name. Implementation can either rename/split the event or expose a stable projection from current `deployment.started`.
