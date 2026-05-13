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
  domainError,
  EnvironmentConfigSnapshot,
  EnvironmentId,
  EnvironmentSnapshotId,
  ExecutionResult,
  ExecutionStatusValue,
  ExecutionStrategyKindValue,
  ExitCode,
  err,
  FinishedAt,
  GeneratedAt,
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

import { createExecutionContext, type ExecutionContext, type RepositoryContext } from "../src";
import {
  type ExecutionBackend,
  type ProcessAttemptRecord,
  type ProcessAttemptRecorder,
} from "../src/ports";
import {
  DeploymentFactory,
  DeploymentLifecycleService,
  RetryDeploymentUseCase,
} from "../src/use-cases";

class SuccessfulExecutionBackend implements ExecutionBackend {
  async execute(
    _context: ExecutionContext,
    deployment: Deployment,
  ): Promise<Result<{ deployment: Deployment }>> {
    deployment.applyExecutionResult(
      FinishedAt.rehydrate("2026-01-01T00:00:20.000Z"),
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
    throw new Error("rollback is not used by retry tests");
  }
}

class FailingExecutionBackend implements ExecutionBackend {
  async execute(): Promise<Result<{ deployment: Deployment }>> {
    return err(
      domainError.provider(
        "Retry runtime failed with raw provider output",
        {
          phase: "runtime-execution",
          step: "container-start",
          safeAdapterErrorCode: "container_start_failed",
        },
        true,
      ),
    );
  }

  async cancel(): ReturnType<ExecutionBackend["cancel"]> {
    return ok({ logs: [] });
  }

  async rollback(): ReturnType<ExecutionBackend["rollback"]> {
    throw new Error("rollback is not used by retry tests");
  }
}

class RecordingProcessAttemptRecorder implements ProcessAttemptRecorder {
  readonly records: ProcessAttemptRecord[] = [];

  async record(
    _context: RepositoryContext,
    attempt: ProcessAttemptRecord,
  ): Promise<Result<ProcessAttemptRecord>> {
    this.records.push(attempt);
    return ok(attempt);
  }
}

function runtimePlan() {
  return RuntimePlan.rehydrate({
    id: RuntimePlanId.rehydrate("rpl_demo"),
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

function sourceDeployment(status: "failed" | "succeeded") {
  return Deployment.rehydrate({
    id: DeploymentId.rehydrate("dep_source"),
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
    finishedAt: FinishedAt.rehydrate("2026-01-01T00:00:10.000Z"),
    triggerKind: DeploymentTriggerKindValue.createDefault(),
  });
}

function createUseCase(input?: { deployment?: Deployment; executionBackend?: ExecutionBackend }) {
  const clock = new FixedClock("2026-01-01T00:00:15.000Z");
  const repository = new MemoryDeploymentRepository();
  const processAttemptRecorder = new RecordingProcessAttemptRecorder();
  const context = createExecutionContext({
    requestId: "req_retry_deployment_test",
    entrypoint: "system",
  });
  repository.items.set("dep_source", input?.deployment ?? sourceDeployment("failed"));

  return {
    context,
    repository,
    useCase: new RetryDeploymentUseCase(
      repository,
      input?.executionBackend ?? new SuccessfulExecutionBackend(),
      new CapturedEventBus(),
      new NoopLogger(),
      new DeploymentFactory(clock, new SequenceIdGenerator()),
      new DeploymentLifecycleService(clock),
      new PassThroughMutationCoordinator(),
      processAttemptRecorder,
    ),
    processAttemptRecorder,
  };
}

describe("RetryDeploymentUseCase", () => {
  test("[DEP-RETRY-001] PROC-DELIVERY-001 creates a new retry attempt from retained snapshot intent", async () => {
    const { context, processAttemptRecorder, repository, useCase } = createUseCase();

    const result = await useCase.execute(context, {
      deploymentId: "dep_source",
      readinessGeneratedAt: "2026-01-01T00:00:12.000Z",
    });

    expect(result.isOk()).toBe(true);
    const retryDeployment = repository.items.get(result._unsafeUnwrap().id);
    expect(retryDeployment?.toState().triggerKind.value).toBe("retry");
    expect(retryDeployment?.toState().sourceDeploymentId).toEqual(
      DeploymentId.rehydrate("dep_source"),
    );
    expect(processAttemptRecorder.records).toHaveLength(2);
    expect(processAttemptRecorder.records[0]).toMatchObject({
      id: result._unsafeUnwrap().id,
      kind: "deployment",
      status: "running",
      operationKey: "deployments.retry",
      dedupeKey: `deployment:${result._unsafeUnwrap().id}`,
      correlationId: "req_retry_deployment_test",
      requestId: "req_retry_deployment_test",
      phase: "deployment-execution",
      step: "running",
      projectId: "prj_demo",
      resourceId: "res_demo",
      deploymentId: result._unsafeUnwrap().id,
      serverId: "srv_demo",
      nextActions: ["no-action"],
      safeDetails: {
        triggerKind: "retry",
        deploymentStatus: "running",
        buildStrategy: "prebuilt-image",
        packagingMode: "all-in-one-docker",
        executionKind: "docker-container",
        targetKind: "single-server",
        targetProviderKey: "local-shell",
        stepCount: 1,
        sourceDeploymentId: "dep_source",
      },
    });
    expect(processAttemptRecorder.records[1]).toMatchObject({
      id: result._unsafeUnwrap().id,
      kind: "deployment",
      status: "succeeded",
      operationKey: "deployments.retry",
      step: "succeeded",
      deploymentId: result._unsafeUnwrap().id,
      nextActions: ["no-action"],
      safeDetails: {
        triggerKind: "retry",
        deploymentStatus: "succeeded",
        sourceDeploymentId: "dep_source",
      },
    });
  });

  test("[DEP-RETRY-001] [PROC-DELIVERY-004] records retriable retry execution failure visibility", async () => {
    const { context, processAttemptRecorder, useCase } = createUseCase({
      executionBackend: new FailingExecutionBackend(),
    });

    const result = await useCase.execute(context, {
      deploymentId: "dep_source",
      readinessGeneratedAt: "2026-01-01T00:00:12.000Z",
    });

    expect(result.isOk()).toBe(true);
    const deploymentId = result._unsafeUnwrap().id;
    expect(processAttemptRecorder.records.map((record) => record.status)).toEqual([
      "running",
      "failed",
    ]);
    expect(processAttemptRecorder.records[1]).toMatchObject({
      id: deploymentId,
      kind: "deployment",
      status: "failed",
      operationKey: "deployments.retry",
      dedupeKey: `deployment:${deploymentId}`,
      phase: "deployment-execution",
      step: "failed",
      projectId: "prj_demo",
      resourceId: "res_demo",
      deploymentId,
      serverId: "srv_demo",
      errorCode: "provider_error",
      errorCategory: "async-processing",
      retriable: true,
      nextActions: ["diagnostic", "manual-review"],
      safeDetails: expect.objectContaining({
        triggerKind: "retry",
        deploymentStatus: "failed",
        failurePhase: "runtime-execution",
        failureStep: "container-start",
        safeAdapterErrorCode: "container_start_failed",
        sourceDeploymentId: "dep_source",
      }),
    });
    expect(JSON.stringify(processAttemptRecorder.records)).not.toContain(
      "Retry runtime failed with raw provider output",
    );
  });

  test("[DEP-RETRY-003] rejects stale readiness markers", async () => {
    const { context, useCase } = createUseCase();

    const result = await useCase.execute(context, {
      deploymentId: "dep_source",
      readinessGeneratedAt: "2026-01-01T00:00:01.000Z",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "deployment_recovery_state_stale",
    });
  });

  test("[DEP-RETRY-002] rejects non-retryable source attempts", async () => {
    const { context, useCase } = createUseCase({
      deployment: sourceDeployment("succeeded"),
    });

    const result = await useCase.execute(context, {
      deploymentId: "dep_source",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "deployment_not_retryable",
    });
  });
});

describe("DeploymentFactory recovery helpers", () => {
  test("[DEP-ROLLBACK-001] creates rollback attempts from selected candidate state", () => {
    const factory = new DeploymentFactory(
      new FixedClock("2026-01-01T00:00:15.000Z"),
      new SequenceIdGenerator(),
    );

    const result = factory.createRollback({
      candidateDeployment: sourceDeployment("succeeded"),
      sourceDeploymentId: DeploymentId.rehydrate("dep_failed"),
    });

    expect(result.isOk()).toBe(true);
    const rollbackState = result._unsafeUnwrap().toState();
    expect(rollbackState.id.value).toBe("dep_0001");
    expect(rollbackState.triggerKind.value).toBe("rollback");
    expect(rollbackState.sourceDeploymentId).toEqual(DeploymentId.rehydrate("dep_failed"));
    expect(rollbackState.rollbackCandidateDeploymentId).toEqual(
      DeploymentId.rehydrate("dep_source"),
    );
  });
});
