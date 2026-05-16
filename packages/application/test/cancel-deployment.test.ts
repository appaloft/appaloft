import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  BuildStrategyKindValue,
  ConfigScopeValue,
  CreatedAt,
  Deployment,
  DeploymentId,
  DeploymentLogEntry,
  DeploymentPhaseValue,
  DeploymentStatusValue,
  DeploymentTargetDescriptor,
  DeploymentTargetId,
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
  MemoryDeploymentRepository,
  NoopLogger,
  PassThroughMutationCoordinator,
} from "@appaloft/testkit";

import { createExecutionContext, type ExecutionContext } from "../src";
import { type ExecutionBackend } from "../src/ports";
import { CancelDeploymentUseCase, DeploymentLifecycleService } from "../src/use-cases";

class RecordingExecutionBackend implements ExecutionBackend {
  readonly canceledDeploymentIds: string[] = [];

  async execute(): ReturnType<ExecutionBackend["execute"]> {
    throw new Error("execute is not used by cancel tests");
  }

  async cancel(
    _context: ExecutionContext,
    deployment: Deployment,
  ): Promise<Result<{ logs: DeploymentLogEntry[] }>> {
    this.canceledDeploymentIds.push(deployment.toState().id.value);
    return ok({
      logs: [
        DeploymentLogEntry.rehydrate({
          timestamp: OccurredAt.rehydrate("2026-01-01T00:00:15.000Z"),
          phase: DeploymentPhaseValue.rehydrate("deploy"),
          level: LogLevelValue.rehydrate("warn"),
          message: MessageText.rehydrate("Runtime cancellation requested"),
        }),
      ],
    });
  }

  async rollback(): ReturnType<ExecutionBackend["rollback"]> {
    throw new Error("rollback is not used by cancel tests");
  }
}

function runtimePlan() {
  return RuntimePlan.rehydrate({
    id: RuntimePlanId.rehydrate("rpl_cancel"),
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

function deployment(status: "planned" | "running" | "succeeded") {
  return Deployment.rehydrate({
    id: DeploymentId.rehydrate("dep_cancel"),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    resourceId: ResourceId.rehydrate("res_demo"),
    serverId: DeploymentTargetId.rehydrate("srv_demo"),
    destinationId: DestinationId.rehydrate("dst_demo"),
    status: DeploymentStatusValue.rehydrate(status),
    runtimePlan: runtimePlan(),
    environmentSnapshot: EnvironmentConfigSnapshot.rehydrate({
      id: EnvironmentSnapshotId.rehydrate("snap_demo"),
      environmentId: EnvironmentId.rehydrate("env_demo"),
      createdAt: GeneratedAt.rehydrate("2026-01-01T00:00:00.000Z"),
      precedence: [ConfigScopeValue.rehydrate("environment")],
      variables: [],
    }),
    dependencyBindingReferences: [],
    logs: [],
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    ...(status === "running" ? { startedAt: StartedAt.rehydrate("2026-01-01T00:00:02.000Z") } : {}),
    triggerKind: DeploymentTriggerKindValue.createDefault(),
  });
}

function createUseCase(input?: { deployment?: Deployment }) {
  const repository = new MemoryDeploymentRepository();
  const executionBackend = new RecordingExecutionBackend();
  const eventBus = new CapturedEventBus();
  const clock = new FixedClock("2026-01-01T00:00:15.000Z");
  const context = createExecutionContext({
    requestId: "req_cancel_deployment_test",
    entrypoint: "system",
  });
  repository.items.set("dep_cancel", input?.deployment ?? deployment("running"));

  return {
    context,
    eventBus,
    executionBackend,
    repository,
    useCase: new CancelDeploymentUseCase(
      repository,
      executionBackend,
      new DeploymentLifecycleService(clock),
      eventBus,
      new NoopLogger(),
      new PassThroughMutationCoordinator(),
    ),
  };
}

describe("CancelDeploymentUseCase", () => {
  test("[DEP-CANCEL-001] cancels a running deployment through the runtime backend", async () => {
    const { context, eventBus, executionBackend, repository, useCase } = createUseCase();

    const result = await useCase.execute(context, {
      deploymentId: "dep_cancel",
      confirm: "dep_cancel",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      id: "dep_cancel",
      status: "canceled",
      canceledAt: "2026-01-01T00:00:15.000Z",
    });
    expect(executionBackend.canceledDeploymentIds).toEqual(["dep_cancel"]);
    const stored = repository.items.get("dep_cancel")?.toState();
    expect(stored?.status.value).toBe("canceled");
    expect(stored?.finishedAt?.value).toBe("2026-01-01T00:00:15.000Z");
    expect(stored?.logs.map((log) => log.toState().message.value)).toContain(
      "Runtime cancellation requested",
    );
    expect(eventBus.events.map((event) => (event as { type: string }).type)).toEqual([
      "deployment.cancel_requested",
      "deployment.canceled",
      "deployment.finished",
    ]);
  });

  test("[DEP-CANCEL-002] cancels a planned deployment without runtime cancellation", async () => {
    const { context, executionBackend, repository, useCase } = createUseCase({
      deployment: deployment("planned"),
    });

    const result = await useCase.execute(context, {
      deploymentId: "dep_cancel",
      confirm: "dep_cancel",
    });

    expect(result.isOk()).toBe(true);
    expect(executionBackend.canceledDeploymentIds).toEqual([]);
    expect(repository.items.get("dep_cancel")?.toState().status.value).toBe("canceled");
  });

  test("[DEP-CANCEL-003] rejects terminal deployment attempts", async () => {
    const { context, useCase } = createUseCase({ deployment: deployment("succeeded") });

    const result = await useCase.execute(context, {
      deploymentId: "dep_cancel",
      confirm: "dep_cancel",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe("deployment_cancel_not_allowed");
  });

  test("[DEP-CANCEL-004] rejects confirmation mismatch before mutation", async () => {
    const { context, executionBackend, repository, useCase } = createUseCase();

    const result = await useCase.execute(context, {
      deploymentId: "dep_cancel",
      confirm: "dep_other",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe("validation_error");
    expect(executionBackend.canceledDeploymentIds).toEqual([]);
    expect(repository.items.get("dep_cancel")?.toState().status.value).toBe("running");
  });
});
