# build-requested Event Spec

## Normative Contract

`build-requested` means the deployment process has accepted a build/package step for an already accepted deployment request.

This is a formal async orchestration event in the target deployment workflow. It does not mean the build has completed or deployment has started.

Prebuilt image deployments skip `build-requested` unless artifact verification is later modeled as a separate event.

## Event Type

Application orchestration event.

It should become a domain event only if the domain explicitly models build requests as business facts with their own durable lifecycle.

## Trigger

Publish after:

1. `deployment-requested` exists for the deployment attempt;
2. source information is available;
3. the immutable environment snapshot exists;
4. the runtime plan is resolved and persisted;
5. the plan requires build/package work.

## Publisher

Target publisher: deployment process manager.

## Consumers

Expected consumers:

- build/package worker;
- runtime adapter;
- artifact projection;
- deployment process manager.

## Payload

```ts
type BuildRequestedPayload = {
  deploymentId: string;
  runtimePlanId: string;
  projectId: string;
  environmentId: string;
  resourceId: string;
  sourceKind: string;
  sourceLocator: string;
  deploymentMethod: "auto" | "dockerfile" | "docker-compose" | "workspace-commands";
  environmentSnapshotId?: string;
  requestedAt: string;
  correlationId?: string;
  causationId?: string;
};
```

Payload must reference immutable snapshots and ids, not raw secrets or mutable environment data.

## State Progression

The process manager should represent build/package state explicitly, for example:

```text
planned -> build_requested -> building -> built
planned -> build_requested -> building -> build_failed
```

If build state stays outside the `Deployment` aggregate, it still needs durable process state and read-model exposure.

## Idempotency

Build workers must dedupe by `(deploymentId, runtimePlanId)`. Duplicate work must not produce duplicate accepted artifacts or duplicate downstream deployment starts.

## Ordering

`build-requested` must occur after `deployment-requested`.

If build/package work is required, it must occur before `deployment-started`.

## Retry And Failure Handling

Retriable build failure should be recorded as async-processing failure with:

- `code`;
- `phase = build`;
- `deploymentId`;
- `runtimePlanId`;
- `retriable = true`;
- retry attempt count;
- optional `retryAfter`.

Permanent build failure should advance process/deployment state to failed and publish `deployment-failed`.

Retrying the entire deployment creates a new deployment attempt.

## Current Implementation Notes And Migration Gaps

The current code does not publish `build-requested`. Build/package work is currently hidden inside runtime plan resolution and/or runtime backend execution. Technical progress events may show package/deploy phases, but those are not formal orchestration events.
