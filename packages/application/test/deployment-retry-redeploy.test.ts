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

import { createExecutionContext, type ExecutionContext, type RepositoryContext } from "../src";
import {
  type ExecutionBackend,
  type MutationCoordinator,
  type MutationCoordinatorRunExclusiveInput,
  type ProcessAttemptRecord,
  type ProcessAttemptRecorder,
} from "../src/ports";
import {
  type CreateDeploymentUseCase,
  DeploymentFactory,
  DeploymentLifecycleService,
  RedeployDeploymentUseCase,
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
        timeline: [],
      }),
    );
    return ok({ deployment });
  }

  async cancel(): ReturnType<ExecutionBackend["cancel"]> {
    return ok({ timeline: [] });
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
    return ok({ timeline: [] });
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

class BlockingMutationCoordinator implements MutationCoordinator {
  calls: Array<MutationCoordinatorRunExclusiveInput<unknown>> = [];

  async runExclusive<T>(input: MutationCoordinatorRunExclusiveInput<T>): Promise<Result<T>> {
    this.calls.push(input as MutationCoordinatorRunExclusiveInput<unknown>);
    return err({
      code: "coordination_timeout",
      category: "timeout",
      message: "Resource runtime is already owned by another operation",
      retryable: true,
      details: {
        phase: "operation-coordination",
        coordinationScopeKind: input.scope.kind,
        coordinationScope: input.scope.key,
      },
    });
  }
}

class RecordingCreateDeploymentUseCase {
  calls: Array<{
    input: Parameters<CreateDeploymentUseCase["execute"]>[1];
    recovery: Parameters<CreateDeploymentUseCase["execute"]>[2];
  }> = [];

  constructor(private readonly result: Result<{ id: string }> = ok({ id: "dep_redeploy" })) {}

  async execute(
    _context: ExecutionContext,
    input: Parameters<CreateDeploymentUseCase["execute"]>[1],
    recovery: Parameters<CreateDeploymentUseCase["execute"]>[2],
  ): Promise<Result<{ id: string }>> {
    this.calls.push({ input, recovery });
    return this.result;
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

function sourceDeployment(status: "failed" | "succeeded" | "running") {
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
    timeline: [],
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    ...(status === "running"
      ? { startedAt: StartedAt.rehydrate("2026-01-01T00:00:02.000Z") }
      : { finishedAt: FinishedAt.rehydrate("2026-01-01T00:00:10.000Z") }),
    triggerKind: DeploymentTriggerKindValue.createDefault(),
  });
}

function createUseCase(input?: {
  deployment?: Deployment;
  executionBackend?: ExecutionBackend;
  mutationCoordinator?: MutationCoordinator;
}) {
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
      input?.mutationCoordinator ?? new PassThroughMutationCoordinator(),
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

  test("[DEP-RETRY-002] rejects active source attempts without admitting retry work", async () => {
    const { context, repository, useCase } = createUseCase({
      deployment: sourceDeployment("running"),
    });

    const result = await useCase.execute(context, {
      deploymentId: "dep_source",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "deployment_not_retryable",
      details: {
        causeCode: "attempt_not_terminal",
      },
    });
    expect([...repository.items.keys()]).toEqual(["dep_source"]);
  });

  test("[DEP-RETRY-004] rejects retry when resource-runtime coordination is already owned", async () => {
    const mutationCoordinator = new BlockingMutationCoordinator();
    const { context, repository, useCase } = createUseCase({ mutationCoordinator });

    const result = await useCase.execute(context, {
      deploymentId: "dep_source",
      readinessGeneratedAt: "2026-01-01T00:00:12.000Z",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "coordination_timeout",
      details: {
        phase: "operation-coordination",
        coordinationScopeKind: "resource-runtime",
      },
    });
    expect(mutationCoordinator.calls).toHaveLength(1);
    expect([...repository.items.keys()]).toEqual(["dep_source"]);
  });
});

describe("RedeployDeploymentUseCase", () => {
  test("[DEP-REDEPLOY-002] creates a current-profile redeploy without reusing old snapshot truth", async () => {
    const repository = new MemoryDeploymentRepository();
    repository.items.set("dep_source", sourceDeployment("failed"));
    const createDeploymentUseCase = new RecordingCreateDeploymentUseCase();
    const context = createExecutionContext({
      requestId: "req_redeploy_deployment_test",
      entrypoint: "system",
    });
    const useCase = new RedeployDeploymentUseCase(
      repository,
      createDeploymentUseCase as unknown as CreateDeploymentUseCase,
    );

    const result = await useCase.execute(context, {
      resourceId: "res_demo",
      projectId: "prj_current",
      environmentId: "env_current",
      serverId: "srv_current",
      destinationId: "dst_current",
      sourceDeploymentId: "dep_source",
      readinessGeneratedAt: "2026-01-01T00:00:12.000Z",
    });

    expect(result).toEqual(ok({ id: "dep_redeploy" }));
    expect(createDeploymentUseCase.calls).toHaveLength(1);
    expect(createDeploymentUseCase.calls[0]).toMatchObject({
      input: {
        projectId: "prj_current",
        environmentId: "env_current",
        serverId: "srv_current",
        destinationId: "dst_current",
        resourceId: "res_demo",
      },
    });
    expect(createDeploymentUseCase.calls[0]?.recovery?.triggerKind.value).toBe("redeploy");
    expect(createDeploymentUseCase.calls[0]?.recovery).toMatchObject({
      sourceDeploymentId: "dep_source",
      ownerLabel: "deployments.redeploy",
    });
  });

  test("[DEP-REDEPLOY-003] rejects invalid current profile without falling back to retry", async () => {
    const repository = new MemoryDeploymentRepository();
    repository.items.set("dep_source", sourceDeployment("failed"));
    const createDeploymentUseCase = new RecordingCreateDeploymentUseCase(
      err(
        domainError.deploymentNotRedeployable("Current resource profile is invalid", {
          commandName: "deployments.redeploy",
          phase: "redeploy-admission",
          resourceId: "res_demo",
          causeCode: "resource_profile_invalid",
        }),
      ),
    );
    const useCase = new RedeployDeploymentUseCase(
      repository,
      createDeploymentUseCase as unknown as CreateDeploymentUseCase,
    );

    const result = await useCase.execute(
      createExecutionContext({
        requestId: "req_redeploy_invalid_profile_test",
        entrypoint: "system",
      }),
      {
        resourceId: "res_demo",
        projectId: "prj_current",
        environmentId: "env_current",
        serverId: "srv_current",
        sourceDeploymentId: "dep_source",
      },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "deployment_not_redeployable",
      details: {
        causeCode: "resource_profile_invalid",
      },
    });
    expect(createDeploymentUseCase.calls).toHaveLength(1);
    expect(createDeploymentUseCase.calls[0]?.recovery?.triggerKind.value).toBe("redeploy");
  });

  test("[DEP-REDEPLOY-004] rejects redeploy when resource-runtime coordination is already owned", async () => {
    const repository = new MemoryDeploymentRepository();
    repository.items.set("dep_source", sourceDeployment("failed"));
    const createDeploymentUseCase = new RecordingCreateDeploymentUseCase(
      err({
        code: "coordination_timeout",
        category: "timeout",
        message: "Resource runtime is already owned by another operation",
        retryable: true,
        details: {
          phase: "operation-coordination",
          coordinationScopeKind: "resource-runtime",
        },
      }),
    );
    const useCase = new RedeployDeploymentUseCase(
      repository,
      createDeploymentUseCase as unknown as CreateDeploymentUseCase,
    );

    const result = await useCase.execute(
      createExecutionContext({
        requestId: "req_redeploy_coordination_test",
        entrypoint: "system",
      }),
      {
        resourceId: "res_demo",
        projectId: "prj_current",
        environmentId: "env_current",
        serverId: "srv_current",
        sourceDeploymentId: "dep_source",
      },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "coordination_timeout",
      details: {
        phase: "operation-coordination",
        coordinationScopeKind: "resource-runtime",
      },
    });
    expect(createDeploymentUseCase.calls[0]?.recovery?.triggerKind.value).toBe("redeploy");
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
