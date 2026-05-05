import { describe, expect, test } from "bun:test";
import {
  BuildStrategyKindValue,
  ConfigScopeValue,
  CreatedAt,
  Deployment,
  DeploymentDependencyBindingSnapshotReadinessValue,
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
  PackagingModeValue,
  PlanStepText,
  ProjectId,
  ProviderKey,
  ResourceBindingId,
  ResourceBindingScopeValue,
  ResourceBindingTargetName,
  ResourceId,
  ResourceInjectionModeValue,
  ResourceInstanceId,
  ResourceInstanceKindValue,
  RuntimeExecutionPlan,
  RuntimePlan,
  RuntimePlanId,
  SourceDescriptor,
  SourceKindValue,
  SourceLocator,
  StartedAt,
  TargetKindValue,
} from "../src";

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

function snapshot() {
  return EnvironmentConfigSnapshot.rehydrate({
    id: EnvironmentSnapshotId.rehydrate("snap_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    createdAt: GeneratedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    precedence: [ConfigScopeValue.rehydrate("environment")],
    variables: [],
  });
}

function deployment(input: {
  status: "running" | "cancel-requested" | "canceled" | "succeeded";
  supersededByDeploymentId?: string;
}) {
  return Deployment.rehydrate({
    id: DeploymentId.rehydrate("dep_demo"),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    resourceId: ResourceId.rehydrate("res_demo"),
    serverId: DeploymentTargetId.rehydrate("srv_demo"),
    destinationId: DestinationId.rehydrate("dst_demo"),
    status: DeploymentStatusValue.rehydrate(input.status),
    runtimePlan: runtimePlan(),
    environmentSnapshot: snapshot(),
    dependencyBindingReferences: [],
    logs: [],
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    triggerKind: DeploymentTriggerKindValue.createDefault(),
    ...(input.supersededByDeploymentId
      ? { supersededByDeploymentId: DeploymentId.rehydrate(input.supersededByDeploymentId) }
      : {}),
  });
}

function createDeployment(input?: { runtimePlan?: RuntimePlan }) {
  return Deployment.create({
    id: DeploymentId.rehydrate("dep_demo"),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    resourceId: ResourceId.rehydrate("res_demo"),
    serverId: DeploymentTargetId.rehydrate("srv_demo"),
    destinationId: DestinationId.rehydrate("dst_demo"),
    runtimePlan: input?.runtimePlan ?? runtimePlan(),
    environmentSnapshot: snapshot(),
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  });
}

describe("Deployment", () => {
  test("[DMBH-DEPLOY-001] answers execution-continuation decisions", () => {
    expect(deployment({ status: "running" }).resolveExecutionContinuation()).toEqual({
      allowed: true,
    });
    expect(deployment({ status: "cancel-requested" }).resolveExecutionContinuation()).toEqual({
      allowed: false,
    });
    expect(deployment({ status: "canceled" }).resolveExecutionContinuation()).toEqual({
      allowed: false,
    });
    expect(
      deployment({
        status: "running",
        supersededByDeploymentId: "dep_next",
      }).resolveExecutionContinuation(),
    ).toEqual({
      allowed: false,
      supersededByDeploymentId: DeploymentId.rehydrate("dep_next"),
    });
  });

  test("[DMBH-DEPLOY-001] answers whether supersede requires runtime cancellation", () => {
    expect(deployment({ status: "running" }).requiresRuntimeCancellationForSupersede()).toBe(true);
    expect(deployment({ status: "succeeded" }).requiresRuntimeCancellationForSupersede()).toBe(
      false,
    );
  });

  test("[DMBH-DEPLOY-001] delegates runtime-plan behavior without peeling plan state", () => {
    const emptyPlan = RuntimePlan.rehydrate({
      ...runtimePlan().toState(),
      steps: [],
    });
    expect(emptyPlan.hasSteps()).toBe(false);
    expect(createDeployment({ runtimePlan: emptyPlan }).isErr()).toBe(true);

    const deployablePlan = runtimePlan().withExecutionMetadata({ base: "image" });
    const deployment = createDeployment({ runtimePlan: deployablePlan })._unsafeUnwrap();
    deployment.markPlanning(StartedAt.rehydrate("2026-01-01T00:00:01.000Z"));
    deployment.markPlanned(StartedAt.rehydrate("2026-01-01T00:00:02.000Z"));
    deployment.start(StartedAt.rehydrate("2026-01-01T00:00:03.000Z"));

    const result = ExecutionResult.rehydrate({
      status: ExecutionStatusValue.rehydrate("failed"),
      exitCode: ExitCode.rehydrate(1),
      retryable: true,
      logs: [],
      metadata: { phase: "execute" },
    });
    deployment.applyExecutionResult(FinishedAt.rehydrate("2026-01-01T00:00:04.000Z"), result);

    expect(deployment.toState().runtimePlan.toState().execution.toState().metadata).toEqual({
      base: "image",
      phase: "execute",
    });
  });

  test("[DEP-RETRY-001] records recovery trigger metadata on lifecycle events", () => {
    const sourceDeploymentId = DeploymentId.rehydrate("dep_source");
    const deployment = Deployment.create({
      id: DeploymentId.rehydrate("dep_retry"),
      projectId: ProjectId.rehydrate("prj_demo"),
      environmentId: EnvironmentId.rehydrate("env_demo"),
      resourceId: ResourceId.rehydrate("res_demo"),
      serverId: DeploymentTargetId.rehydrate("srv_demo"),
      destinationId: DestinationId.rehydrate("dst_demo"),
      runtimePlan: runtimePlan(),
      environmentSnapshot: snapshot(),
      createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
      triggerKind: DeploymentTriggerKindValue.retry(),
      sourceDeploymentId,
    })._unsafeUnwrap();

    deployment.markPlanning(StartedAt.rehydrate("2026-01-01T00:00:01.000Z"));
    deployment.markPlanned(StartedAt.rehydrate("2026-01-01T00:00:02.000Z"));
    deployment.start(StartedAt.rehydrate("2026-01-01T00:00:03.000Z"));

    expect(deployment.toState()).toMatchObject({
      triggerKind: DeploymentTriggerKindValue.retry(),
      sourceDeploymentId,
    });
    expect(deployment.pullDomainEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "deployment.started",
          payload: {
            triggerKind: "retry",
            sourceDeploymentId: "dep_source",
          },
        }),
      ]),
    );
  });

  test("[DEP-BIND-SNAP-REF-001] stores dependency binding safe references on the deployment snapshot", () => {
    const created = Deployment.create({
      id: DeploymentId.rehydrate("dep_demo"),
      projectId: ProjectId.rehydrate("prj_demo"),
      environmentId: EnvironmentId.rehydrate("env_demo"),
      resourceId: ResourceId.rehydrate("res_demo"),
      serverId: DeploymentTargetId.rehydrate("srv_demo"),
      destinationId: DestinationId.rehydrate("dst_demo"),
      runtimePlan: runtimePlan(),
      environmentSnapshot: snapshot(),
      dependencyBindingReferences: [
        {
          bindingId: ResourceBindingId.rehydrate("rbd_pg"),
          dependencyResourceId: ResourceInstanceId.rehydrate("rsi_pg"),
          kind: ResourceInstanceKindValue.rehydrate("postgres"),
          targetName: ResourceBindingTargetName.rehydrate("DATABASE_URL"),
          scope: ResourceBindingScopeValue.rehydrate("runtime-only"),
          injectionMode: ResourceInjectionModeValue.rehydrate("env"),
          snapshotReadiness: DeploymentDependencyBindingSnapshotReadinessValue.ready(),
        },
      ],
      createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    })._unsafeUnwrap();

    expect(created.toState().dependencyBindingReferences).toHaveLength(1);
    expect(created.toState().dependencyBindingReferences[0]).toMatchObject({
      bindingId: ResourceBindingId.rehydrate("rbd_pg"),
      dependencyResourceId: ResourceInstanceId.rehydrate("rsi_pg"),
      kind: ResourceInstanceKindValue.rehydrate("postgres"),
      targetName: ResourceBindingTargetName.rehydrate("DATABASE_URL"),
      scope: ResourceBindingScopeValue.rehydrate("runtime-only"),
      injectionMode: ResourceInjectionModeValue.rehydrate("env"),
      snapshotReadiness: DeploymentDependencyBindingSnapshotReadinessValue.ready(),
    });
  });
});
