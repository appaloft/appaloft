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
  DestinationId,
  DetectSummary,
  DisplayNameText,
  EnvironmentConfigSnapshot,
  EnvironmentId,
  EnvironmentSnapshotId,
  ExecutionStrategyKindValue,
  GeneratedAt,
  PackagingModeValue,
  PlanStepText,
  ProjectId,
  ProviderKey,
  ResourceId,
  RuntimeExecutionPlan,
  RuntimePlan,
  RuntimePlanId,
  SourceDescriptor,
  SourceKindValue,
  SourceLocator,
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
    logs: [],
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    ...(input.supersededByDeploymentId
      ? { supersededByDeploymentId: DeploymentId.rehydrate(input.supersededByDeploymentId) }
      : {}),
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
});
