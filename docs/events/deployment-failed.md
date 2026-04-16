# deployment-failed Event Spec

## Normative Contract

`deployment-failed` means a deployment attempt reached terminal failure and the deployment state has been durably persisted as failed.

For `deployments.create`, post-acceptance runtime failure must persist `Deployment.status = failed` and the original command result remains `ok({ id })`.

`deployment-failed` is the canonical terminal failure event for the target model.

For v1, failure may come from Docker/OCI artifact resolution, image build/pull, runtime target
render/apply/observation, proxy route realization, deployment-time verification, cleanup, or
adapter-level rollback.

## Event Type

Domain event for the `Deployment` aggregate, with optional integration-event copies published through an outbox.

During migration, this event may be derived from the current generic `deployment.finished` event when `payload.status === "failed"`.

## Trigger

Publish after:

1. runtime/build/deploy/verify processing determines the attempt failed;
2. aggregate or process state transition to failed succeeds;
3. terminal failure state is durably persisted.

## Publisher

Target publisher: `Deployment` aggregate or deployment process manager records the terminal failure; application layer publishes it after persistence, preferably through an outbox.

## Consumers

Expected consumers:

- deployment read-model projection;
- retry/process manager;
- notification/audit;
- observability/metrics projection.

## Payload

```ts
type DeploymentFailedPayload = {
  deploymentId: string;
  projectId: string;
  environmentId: string;
  resourceId: string;
  serverId: string;
  destinationId: string;
  runtimePlanId: string;
  finishedAt: string;
  exitCode: number;
  errorCode?: string;
  retriable: boolean;
  failurePhase?: "detect" | "plan" | "image-build" | "image-pull" | "deploy" | "proxy-route-realization" | "verify" | "rollback";
  runtimeArtifactKind?: "image" | "compose-project";
  runtimeTarget?: {
    targetKind: string;
    providerKey: string;
    backendKey?: string;
  };
  correlationId?: string;
  causationId?: string;
};
```

## State Progression

Required state transition:

```text
running -> failed
```

If build/package is split into its own process state, build failure may occur before deployment runtime state reaches `running`, but it must still be exposed as a terminal failed deployment attempt or a clearly linked failed process state.

If the adapter attempts to preserve or restore a previous container/image/Compose project after a
failed rollout, that rollback result is part of the failed deployment diagnostics. It does not make
the failed deployment a success and does not expose a public rollback command.

## Idempotency

Consumers must dedupe by exact event id when available, otherwise by `(deploymentId, "deployment-failed")`.

Duplicate failure events must not schedule duplicate retries.

## Ordering

`deployment-failed` must follow the accepted request. If runtime rollout has started, it must follow `deployment-started`.

It is mutually exclusive with `deployment-succeeded` for the same deployment attempt.

## Retry And Failure Handling

If `retriable = true`, a process manager may schedule retry through an explicit retry command or job.

Retry creates a new deployment attempt with a new deployment id. The failed deployment attempt remains immutable historical state.

If `retriable = false`, expose permanent failure to UI, CLI, API, and read models without hidden retry.

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

For now, `deployment-failed` can be treated as a canonical projection of `deployment.finished/status=failed`. The implementation should eventually split this into a first-class event or a stable derived event contract.

Current failure events do not include runtime target backend identity. ADR-023 requires future
failure payloads/read models to expose safe target summaries and phases such as
`runtime-target-resolution`, `runtime-target-apply`, or `runtime-target-observation` without raw
Docker, Swarm, or Kubernetes provider responses.
