import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  BuildStrategyKindValue,
  ConfigScopeValue,
  CreatedAt,
  Deployment,
  DeploymentId,
  DeploymentPhaseValue,
  DeploymentStatusValue,
  DeploymentTargetDescriptor,
  DeploymentTargetId,
  DeploymentTimelineJournalEntry,
  DeploymentTriggerKindValue,
  DestinationId,
  DetectSummary,
  DisplayNameText,
  EnvironmentConfigSnapshot,
  EnvironmentId,
  EnvironmentSnapshotId,
  ExecutionStrategyKindValue,
  GeneratedAt,
  LogLevelValue,
  MessageText,
  OccurredAt,
  ok,
  PackagingModeValue,
  PlanStepText,
  ProjectId,
  ProviderKey,
  ResourceId,
  type Result,
  RuntimeExecutionPlan,
  RuntimePlan,
  RuntimePlanId,
  SourceDescriptor,
  SourceKindValue,
  SourceLocator,
  StartedAt,
  TargetKindValue,
} from "@appaloft/core";
import {
  CapturedEventBus,
  FixedClock,
  MemoryDeploymentReadModel,
  MemoryDeploymentRepository,
  NoopLogger,
  PassThroughMutationCoordinator,
} from "@appaloft/testkit";
import { createExecutionContext, type ExecutionContext } from "../src";
import { observeDeploymentStaleness } from "../src/operations/deployments/deployment-stale-attempt.policy";
import { ListStaleDeploymentAttemptsQuery } from "../src/operations/deployments/list-stale-deployment-attempts.query";
import { ListStaleDeploymentAttemptsQueryService } from "../src/operations/deployments/list-stale-deployment-attempts.query-service";
import { type ExecutionBackend } from "../src/ports";
import { DeploymentLifecycleService, ReconcileStaleDeploymentUseCase } from "../src/use-cases";

class RecordingBackend implements ExecutionBackend {
  readonly canceled: string[] = [];
  async execute(): ReturnType<ExecutionBackend["execute"]> {
    throw new Error("not used");
  }
  async rollback(): ReturnType<ExecutionBackend["rollback"]> {
    throw new Error("not used");
  }
  async cancel(
    _context: ExecutionContext,
    deployment: Deployment,
  ): Promise<Result<{ timeline: DeploymentTimelineJournalEntry[] }>> {
    this.canceled.push(deployment.toState().id.value);
    return ok({ timeline: [] });
  }
}

function runtimePlan() {
  return RuntimePlan.rehydrate({
    id: RuntimePlanId.rehydrate("rpl_stale"),
    source: SourceDescriptor.rehydrate({
      kind: SourceKindValue.rehydrate("local-folder"),
      locator: SourceLocator.rehydrate("/workspace/app"),
      displayName: DisplayNameText.rehydrate("app"),
    }),
    buildStrategy: BuildStrategyKindValue.rehydrate("prebuilt-image"),
    packagingMode: PackagingModeValue.rehydrate("all-in-one-docker"),
    execution: RuntimeExecutionPlan.rehydrate({
      kind: ExecutionStrategyKindValue.rehydrate("docker-container"),
    }),
    target: DeploymentTargetDescriptor.rehydrate({
      kind: TargetKindValue.rehydrate("single-server"),
      providerKey: ProviderKey.rehydrate("local-shell"),
      serverIds: [DeploymentTargetId.rehydrate("srv_demo")],
    }),
    detectSummary: DetectSummary.rehydrate("prebuilt image"),
    steps: [PlanStepText.rehydrate("Run container")],
    generatedAt: GeneratedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  });
}

function deployment(input: {
  id?: string;
  status: "planned" | "running" | "succeeded";
  activityAt?: string;
}) {
  const createdAt = input.activityAt ?? "2026-01-01T00:00:00.000Z";
  return Deployment.rehydrate({
    id: DeploymentId.rehydrate(input.id ?? "dep_stale"),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    resourceId: ResourceId.rehydrate(`res_${input.id ?? "stale"}`),
    serverId: DeploymentTargetId.rehydrate("srv_demo"),
    destinationId: DestinationId.rehydrate("dst_demo"),
    status: DeploymentStatusValue.rehydrate(input.status),
    runtimePlan: runtimePlan(),
    environmentSnapshot: EnvironmentConfigSnapshot.rehydrate({
      id: EnvironmentSnapshotId.rehydrate("snap_demo"),
      environmentId: EnvironmentId.rehydrate("env_demo"),
      createdAt: GeneratedAt.rehydrate(createdAt),
      precedence: [ConfigScopeValue.rehydrate("environment")],
      variables: [],
    }),
    dependencyBindingReferences: [],
    timeline: input.activityAt
      ? [
          DeploymentTimelineJournalEntry.rehydrate({
            timestamp: OccurredAt.rehydrate(input.activityAt),
            phase: DeploymentPhaseValue.rehydrate("deploy"),
            level: LogLevelValue.rehydrate("info"),
            message: MessageText.rehydrate("durable activity"),
          }),
        ]
      : [],
    createdAt: CreatedAt.rehydrate(createdAt),
    ...(input.status === "running" ? { startedAt: StartedAt.rehydrate(createdAt) } : {}),
    triggerKind: DeploymentTriggerKindValue.createDefault(),
  });
}

function stateVersion(candidate: Deployment, checkedAt = "2026-01-01T01:00:00.000Z") {
  const state = candidate.toState();
  return observeDeploymentStaleness(
    {
      id: state.id.value,
      status: state.status.value,
      createdAt: state.createdAt.value,
      ...(state.startedAt ? { startedAt: state.startedAt.value } : {}),
      timeline: state.timeline.map((entry) => ({ timestamp: entry.timestamp })),
    },
    { checkedAt, staleAfterSeconds: 900 },
  ).stateVersion;
}

function harness(candidate: Deployment) {
  const repository = new MemoryDeploymentRepository();
  repository.items.set(candidate.toState().id.value, candidate);
  const backend = new RecordingBackend();
  const clock = new FixedClock("2026-01-01T01:00:00.000Z");
  const events = new CapturedEventBus();
  return {
    backend,
    clock,
    events,
    repository,
    context: createExecutionContext({ requestId: "req_stale", entrypoint: "system" }),
    useCase: new ReconcileStaleDeploymentUseCase(
      repository,
      backend,
      new DeploymentLifecycleService(clock),
      clock,
      events,
      new NoopLogger(),
      new PassThroughMutationCoordinator(),
    ),
  };
}

describe("deployment stale-attempt reconciliation", () => {
  test("[DEP-STALE-001 DEP-STALE-006] lists only bounded non-terminal stale attempts", async () => {
    const repository = new MemoryDeploymentRepository();
    repository.items.set("dep_old", deployment({ id: "dep_old", status: "running" }));
    repository.items.set(
      "dep_recent",
      deployment({ id: "dep_recent", status: "running", activityAt: "2026-01-01T00:59:30.000Z" }),
    );
    repository.items.set("dep_done", deployment({ id: "dep_done", status: "succeeded" }));
    const query = ListStaleDeploymentAttemptsQuery.create({
      staleAfterSeconds: 900,
      limit: 10,
    })._unsafeUnwrap();
    const result = await new ListStaleDeploymentAttemptsQueryService(
      new MemoryDeploymentReadModel(repository),
      new FixedClock("2026-01-01T01:00:00.000Z"),
    ).execute(createExecutionContext({ requestId: "req_list_stale", entrypoint: "system" }), query);

    expect(result.items.map((item) => item.deploymentId)).toEqual(["dep_old"]);
    expect(result.items[0]).toMatchObject({
      status: "running",
      staleForSeconds: 3600,
      runtimeCancellationRequired: true,
    });
  });

  test("[DEP-STALE-002] interrupts a planned stale attempt without runtime cancellation", async () => {
    const candidate = deployment({ status: "planned" });
    const { backend, context, events, repository, useCase } = harness(candidate);
    const result = await useCase.execute(context, {
      deploymentId: "dep_stale",
      confirm: "dep_stale",
      stateVersion: stateVersion(candidate),
      staleAfterSeconds: 900,
    });
    expect(result._unsafeUnwrap().status).toBe("interrupted");
    expect(backend.canceled).toEqual([]);
    expect(repository.items.get("dep_stale")?.toState().status.value).toBe("interrupted");
    expect(events.events.map((event) => (event as { type: string }).type)).toEqual([
      "deployment.interrupted",
      "deployment.finished",
    ]);
  });

  test("[DEP-STALE-003] cancels runtime before interrupting a running stale attempt", async () => {
    const candidate = deployment({ status: "running" });
    const { backend, context, useCase } = harness(candidate);
    const result = await useCase.execute(context, {
      deploymentId: "dep_stale",
      confirm: "dep_stale",
      stateVersion: stateVersion(candidate),
      staleAfterSeconds: 900,
    });
    expect(result.isOk()).toBe(true);
    expect(backend.canceled).toEqual(["dep_stale"]);
  });

  test("[DEP-STALE-004] rejects an observation after durable activity changes", async () => {
    const candidate = deployment({ status: "running" });
    const observedVersion = stateVersion(candidate);
    candidate.appendTimeline([
      DeploymentTimelineJournalEntry.rehydrate({
        timestamp: OccurredAt.rehydrate("2026-01-01T00:59:30.000Z"),
        phase: DeploymentPhaseValue.rehydrate("deploy"),
        level: LogLevelValue.rehydrate("info"),
        message: MessageText.rehydrate("new activity"),
      }),
    ]);
    const { backend, context, useCase } = harness(candidate);
    const result = await useCase.execute(context, {
      deploymentId: "dep_stale",
      confirm: "dep_stale",
      stateVersion: observedVersion,
      staleAfterSeconds: 900,
    });
    expect(result._unsafeUnwrapErr().code).toBe("deployment_reconciliation_state_stale");
    expect(backend.canceled).toEqual([]);
  });

  test("[DEP-STALE-005] rejects a recent attempt even with its current state version", async () => {
    const candidate = deployment({ status: "running", activityAt: "2026-01-01T00:59:30.000Z" });
    const { context, useCase } = harness(candidate);
    const result = await useCase.execute(context, {
      deploymentId: "dep_stale",
      confirm: "dep_stale",
      stateVersion: stateVersion(candidate),
      staleAfterSeconds: 900,
    });
    expect(result._unsafeUnwrapErr().code).toBe("deployment_reconciliation_not_allowed");
  });
});
