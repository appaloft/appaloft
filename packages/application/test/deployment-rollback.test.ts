import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  BuildStrategyKindValue,
  ConfigScopeValue,
  CreatedAt,
  Deployment,
  DeploymentId,
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
  ExecutionResult,
  ExecutionStatusValue,
  ExecutionStrategyKindValue,
  ExitCode,
  FinishedAt,
  GeneratedAt,
  ImageReference,
  ok,
  PackagingModeValue,
  PlanStepText,
  ProjectId,
  ProviderKey,
  ResourceId,
  type Result,
  RuntimeArtifactIntentValue,
  RuntimeArtifactKindValue,
  RuntimeArtifactSnapshot,
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
  SequenceIdGenerator,
} from "@appaloft/testkit";

import { createExecutionContext, type ExecutionContext } from "../src";
import { type ExecutionBackend } from "../src/ports";
import {
  DeploymentFactory,
  DeploymentLifecycleService,
  RollbackDeploymentUseCase,
} from "../src/use-cases";

class SuccessfulExecutionBackend implements ExecutionBackend {
  async execute(
    _context: ExecutionContext,
    deployment: Deployment,
  ): Promise<Result<{ deployment: Deployment }>> {
    deployment.applyExecutionResult(
      FinishedAt.rehydrate("2026-01-01T00:00:30.000Z"),
      ExecutionResult.rehydrate({
        status: ExecutionStatusValue.rehydrate("succeeded"),
        exitCode: ExitCode.rehydrate(0),
        retryable: false,
        logs: [],
      }),
    );
    return ok({ deployment });
  }

  async cancel(): ReturnType<ExecutionBackend["cancel"]> {
    return ok({ logs: [] });
  }

  async rollback(): ReturnType<ExecutionBackend["rollback"]> {
    throw new Error("rollback backend method is not used by deployment rollback commands");
  }
}

function runtimePlan(input: { id: string; includeArtifact?: boolean }) {
  return RuntimePlan.rehydrate({
    id: RuntimePlanId.rehydrate(input.id),
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
    ...(input.includeArtifact
      ? {
          runtimeArtifact: RuntimeArtifactSnapshot.rehydrate({
            kind: RuntimeArtifactKindValue.rehydrate("image"),
            intent: RuntimeArtifactIntentValue.rehydrate("prebuilt-image"),
            image: ImageReference.rehydrate("registry.example/app:stable"),
          }),
        }
      : {}),
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

function deploymentRecord(input: {
  id: string;
  status: "failed" | "succeeded" | "running";
  createdAt: string;
  finishedAt?: string;
  includeArtifact?: boolean;
}) {
  return Deployment.rehydrate({
    id: DeploymentId.rehydrate(input.id),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    resourceId: ResourceId.rehydrate("res_demo"),
    serverId: DeploymentTargetId.rehydrate("srv_demo"),
    destinationId: DestinationId.rehydrate("dst_demo"),
    status: DeploymentStatusValue.rehydrate(input.status),
    runtimePlan: runtimePlan({
      id: `rpl_${input.id}`,
      ...(input.includeArtifact ? { includeArtifact: true } : {}),
    }),
    environmentSnapshot: EnvironmentConfigSnapshot.rehydrate({
      id: EnvironmentSnapshotId.rehydrate(`snap_${input.id}`),
      environmentId: EnvironmentId.rehydrate("env_demo"),
      createdAt: GeneratedAt.rehydrate(input.createdAt),
      precedence: [ConfigScopeValue.rehydrate("environment")],
      variables: [],
    }),
    dependencyBindingReferences: [],
    logs: [],
    createdAt: CreatedAt.rehydrate(input.createdAt),
    ...(input.status === "running" ? { startedAt: StartedAt.rehydrate(input.createdAt) } : {}),
    ...(input.finishedAt ? { finishedAt: FinishedAt.rehydrate(input.finishedAt) } : {}),
    triggerKind: DeploymentTriggerKindValue.createDefault(),
  });
}

function createUseCase(input?: {
  source?: Deployment;
  candidate?: Deployment | null;
  activeDeployment?: Deployment;
}) {
  const clock = new FixedClock("2026-01-01T00:00:20.000Z");
  const repository = new MemoryDeploymentRepository();
  const context = createExecutionContext({
    requestId: "req_rollback_deployment_test",
    entrypoint: "system",
  });

  repository.items.set(
    "dep_failed",
    input?.source ??
      deploymentRecord({
        id: "dep_failed",
        status: "failed",
        createdAt: "2026-01-01T00:00:10.000Z",
        finishedAt: "2026-01-01T00:00:12.000Z",
      }),
  );
  if (input?.candidate !== null) {
    repository.items.set(
      "dep_success",
      input?.candidate ??
        deploymentRecord({
          id: "dep_success",
          status: "succeeded",
          createdAt: "2026-01-01T00:00:00.000Z",
          finishedAt: "2026-01-01T00:00:05.000Z",
          includeArtifact: true,
        }),
    );
  }
  if (input?.activeDeployment) {
    repository.items.set("dep_active", input.activeDeployment);
  }

  return {
    context,
    repository,
    useCase: new RollbackDeploymentUseCase(
      repository,
      new SuccessfulExecutionBackend(),
      new CapturedEventBus(),
      new NoopLogger(),
      new DeploymentFactory(clock, new SequenceIdGenerator()),
      new DeploymentLifecycleService(clock),
      new PassThroughMutationCoordinator(),
    ),
  };
}

describe("RollbackDeploymentUseCase", () => {
  test("[DEP-ROLLBACK-001] creates a new rollback attempt from retained candidate state", async () => {
    const { context, repository, useCase } = createUseCase();

    const result = await useCase.execute(context, {
      deploymentId: "dep_failed",
      rollbackCandidateDeploymentId: "dep_success",
      readinessGeneratedAt: "2026-01-01T00:00:13.000Z",
    });

    expect(result.isOk()).toBe(true);
    const rollbackDeployment = repository.items.get(result._unsafeUnwrap().id);
    expect(rollbackDeployment?.toState().triggerKind.value).toBe("rollback");
    expect(rollbackDeployment?.toState().sourceDeploymentId).toEqual(
      DeploymentId.rehydrate("dep_failed"),
    );
    expect(rollbackDeployment?.toState().rollbackCandidateDeploymentId).toEqual(
      DeploymentId.rehydrate("dep_success"),
    );
  });

  test("[DEP-ROLLBACK-002] rejects missing rollback candidates", async () => {
    const { context, useCase } = createUseCase({ candidate: null });

    const result = await useCase.execute(context, {
      deploymentId: "dep_failed",
      rollbackCandidateDeploymentId: "dep_success",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "deployment_rollback_candidate_not_found",
    });
  });

  test("[DEP-ROLLBACK-003] rejects candidates without retained artifact identity", async () => {
    const { context, useCase } = createUseCase({
      candidate: deploymentRecord({
        id: "dep_success",
        status: "succeeded",
        createdAt: "2026-01-01T00:00:00.000Z",
        finishedAt: "2026-01-01T00:00:05.000Z",
      }),
    });

    const result = await useCase.execute(context, {
      deploymentId: "dep_failed",
      rollbackCandidateDeploymentId: "dep_success",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "deployment_not_rollback_ready",
    });
  });

  test("[DEP-ROLLBACK-004] rejects stale readiness markers", async () => {
    const { context, useCase } = createUseCase();

    const result = await useCase.execute(context, {
      deploymentId: "dep_failed",
      rollbackCandidateDeploymentId: "dep_success",
      readinessGeneratedAt: "2026-01-01T00:00:01.000Z",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "deployment_recovery_state_stale",
    });
  });

  test("[DEP-ROLLBACK-005] rejects rollback while the resource runtime is busy", async () => {
    const { context, useCase } = createUseCase({
      activeDeployment: deploymentRecord({
        id: "dep_active",
        status: "running",
        createdAt: "2026-01-01T00:00:18.000Z",
      }),
    });

    const result = await useCase.execute(context, {
      deploymentId: "dep_failed",
      rollbackCandidateDeploymentId: "dep_success",
      readinessGeneratedAt: "2026-01-01T00:00:19.000Z",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "deployment_not_rollback_ready",
    });
  });
});
