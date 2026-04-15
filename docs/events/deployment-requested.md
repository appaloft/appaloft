# deployment-requested Event Spec

## Normative Contract

`deployment-requested` means a `deployments.create` request has been accepted and durable deployment state exists.

It does not mean build, deploy, verify, notification, projection, or any downstream consumer has completed successfully.

## Event Type

Application event.

It represents admission of a deployment request and is the first orchestration event in the target deployment workflow.

## Trigger

Publish after:

1. command input is valid;
2. deployment context is resolved;
3. the active deployment guard passes;
4. source, runtime, network, and access-route snapshot admission succeeds;
5. durable deployment state is created.

If runtime plan resolution remains part of admission, this event is published after the plan is persisted. If admission is later split earlier, the event timing must be updated in this spec.

## Publisher

Target publisher: `CreateDeploymentUseCase` or a dedicated deployment admission service/process manager.

## Consumers

Expected consumers:

- deployment process manager;
- deployment read-model projection;
- audit/notification consumers;
- future automation/MCP observers.

Consumers must not assume they are the only consumer.

## Payload

```ts
type DeploymentRequestedPayload = {
  deploymentId: string;
  projectId: string;
  environmentId: string;
  resourceId: string;
  serverId: string;
  destinationId: string;
  sourceSnapshot: {
    kind: string;
    locator: string;
  };
  runtimeStrategy: "auto" | "dockerfile" | "docker-compose" | "prebuilt-image" | "workspace-commands";
  accessRouteSnapshot?: {
    routeSource: "generated-default" | "domain-binding" | "none";
    hostnames: string[];
    providerKey?: string;
  };
  requestedAt: string;
  correlationId?: string;
  causationId?: string;
};
```

Payload must not contain secrets or unmasked environment values.

## State Progression

This event corresponds to request acceptance. It should map to durable deployment state such as `created`, `planned`, or a future explicit `accepted` state, depending on where the admission boundary is implemented.

## Idempotency

Consumers must dedupe by `deploymentId` and event type. If an outbox event id exists, consumers should dedupe by exact event id first and semantic key second.

Duplicate `deployment-requested` must not start duplicate build/deploy execution.

## Ordering

Required order for one deployment attempt:

```text
deployment-requested
  -> build-requested, when required
  -> deployment-started
  -> deployment-succeeded | deployment-failed
```

## Retry And Failure Handling

Publication should be backed by an outbox before the event is relied on for durable orchestration.

Consumer failure is an event-processing failure, not a deployment success or deployment failure.

## Current Implementation Notes And Migration Gaps

The current code does not publish `deployment-requested`. The closest current moment is after a `Deployment` aggregate is created and before execution starts, but current code immediately continues to runtime execution inside the same use case.

Current event payloads and runtime plan data still use compatibility naming around deployment method and access routes; canonical payload language should use resource-owned runtime strategy and provider-neutral access route snapshots.
