import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  BuildStrategyKindValue,
  ConfigScopeValue,
  CreatedAt,
  Deployment,
  DeploymentByIdSpec,
  DeploymentId,
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
  UpsertDeploymentSpec,
} from "@appaloft/core";
import { MemoryDeploymentRepository, NoopLogger } from "@appaloft/testkit";

import { createExecutionContext, DeploymentLogProgressRecorder, toRepositoryContext } from "../src";

describe("DeploymentLogProgressRecorder", () => {
  test("[DEP-PROGRESS-RECORDER-001] persists deployment progress events into deployment logs", async () => {
    const context = createExecutionContext({ entrypoint: "system" });
    const repository = new MemoryDeploymentRepository();
    const deployment = createDeployment();

    await repository.insertOne(
      toRepositoryContext(context),
      deployment,
      UpsertDeploymentSpec.fromDeployment(deployment),
    );

    const recorder = new DeploymentLogProgressRecorder(repository, new NoopLogger());

    const event = {
      timestamp: "2026-06-14T07:05:54.000Z",
      deploymentId: "dep_progress_1",
      source: "appaloft" as const,
      phase: "deploy" as const,
      level: "info" as const,
      status: "running" as const,
      message: "Runtime container was started",
      step: { current: 4, total: 5, label: "Start runtime" },
    };

    expect((await recorder.record(context, event)).isOk()).toBe(true);
    expect((await recorder.record(context, event)).isOk()).toBe(true);

    const persisted = await repository.findOne(
      toRepositoryContext(context),
      DeploymentByIdSpec.create(DeploymentId.rehydrate("dep_progress_1")),
    );
    const logs = persisted?.toState().logs ?? [];

    expect(logs).toHaveLength(1);
    const [log] = logs;
    expect(log?.timestamp).toBe("2026-06-14T07:05:54.000Z");
    expect(log?.phase).toBe("deploy");
    expect(log?.message).toBe("Runtime container was started");
  });
});

function createDeployment(): Deployment {
  return Deployment.create({
    id: DeploymentId.rehydrate("dep_progress_1"),
    projectId: ProjectId.rehydrate("prj_progress_1"),
    environmentId: EnvironmentId.rehydrate("env_progress_1"),
    resourceId: ResourceId.rehydrate("res_progress_1"),
    serverId: DeploymentTargetId.rehydrate("srv_progress_1"),
    destinationId: DestinationId.rehydrate("dst_progress_1"),
    runtimePlan: RuntimePlan.rehydrate({
      id: RuntimePlanId.rehydrate("plan_progress_1"),
      source: SourceDescriptor.rehydrate({
        kind: SourceKindValue.rehydrate("docker-image"),
        locator: SourceLocator.rehydrate("pocketbase/pocketbase:latest"),
        displayName: DisplayNameText.rehydrate("PocketBase"),
      }),
      buildStrategy: BuildStrategyKindValue.rehydrate("prebuilt-image"),
      packagingMode: PackagingModeValue.rehydrate("all-in-one-docker"),
      execution: RuntimeExecutionPlan.rehydrate({
        kind: ExecutionStrategyKindValue.rehydrate("docker-container"),
      }),
      target: DeploymentTargetDescriptor.rehydrate({
        kind: TargetKindValue.rehydrate("single-server"),
        providerKey: ProviderKey.rehydrate("generic-ssh"),
        serverIds: [DeploymentTargetId.rehydrate("srv_progress_1")],
      }),
      detectSummary: DetectSummary.rehydrate("Detected Docker image"),
      steps: [PlanStepText.rehydrate("Start container")],
      generatedAt: GeneratedAt.rehydrate("2026-06-14T07:05:00.000Z"),
    }),
    environmentSnapshot: EnvironmentConfigSnapshot.rehydrate({
      id: EnvironmentSnapshotId.rehydrate("snap_progress_1"),
      environmentId: EnvironmentId.rehydrate("env_progress_1"),
      createdAt: GeneratedAt.rehydrate("2026-06-14T07:05:00.000Z"),
      precedence: [ConfigScopeValue.rehydrate("environment")],
      variables: [],
    }),
    createdAt: CreatedAt.rehydrate("2026-06-14T07:05:00.000Z"),
  })._unsafeUnwrap();
}
