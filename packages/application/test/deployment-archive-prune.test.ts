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
  ExecutionStrategyKindValue,
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
  MemoryDeploymentReadModel,
  MemoryDeploymentRepository,
  NoopLogger,
} from "@appaloft/testkit";

import { createExecutionContext, type RepositoryContext } from "../src";
import { ListDeploymentsQueryService } from "../src/operations/deployments/list-deployments.query-service";
import { PruneDeploymentsCommand } from "../src/operations/deployments/prune-deployments.command";
import {
  type DeploymentAttemptPruneInput,
  type DeploymentAttemptPruneStoreResult,
  type DeploymentAttemptRetentionStore,
} from "../src/ports";
import { ArchiveDeploymentUseCase, PruneDeploymentsUseCase } from "../src/use-cases";

class RecordingDeploymentAttemptRetentionStore implements DeploymentAttemptRetentionStore {
  readonly inputs: DeploymentAttemptPruneInput[] = [];

  constructor(private readonly result: DeploymentAttemptPruneStoreResult) {}

  async prune(
    _context: RepositoryContext,
    input: DeploymentAttemptPruneInput,
  ): Promise<Result<DeploymentAttemptPruneStoreResult>> {
    this.inputs.push(input);
    return ok(this.result);
  }
}

function runtimePlan() {
  return RuntimePlan.rehydrate({
    id: RuntimePlanId.rehydrate("rpl_archive"),
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

function deployment(input?: { id?: string; status?: "running" | "succeeded" }) {
  const status = input?.status ?? "succeeded";
  return Deployment.rehydrate({
    id: DeploymentId.rehydrate(input?.id ?? "dep_archive"),
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
    startedAt: StartedAt.rehydrate("2026-01-01T00:00:02.000Z"),
    ...(status === "succeeded"
      ? { finishedAt: FinishedAt.rehydrate("2026-01-01T00:00:15.000Z") }
      : {}),
    triggerKind: DeploymentTriggerKindValue.createDefault(),
  });
}

function createArchiveHarness(input?: { source?: Deployment }) {
  const repository = new MemoryDeploymentRepository();
  const eventBus = new CapturedEventBus();
  const context = createExecutionContext({
    requestId: "req_archive_deployment_test",
    entrypoint: "system",
  });
  const source = input?.source ?? deployment();
  repository.items.set(source.toState().id.value, source);

  return {
    context,
    eventBus,
    repository,
    useCase: new ArchiveDeploymentUseCase(
      repository,
      new FixedClock("2026-01-01T00:01:00.000Z"),
      eventBus,
      new NoopLogger(),
    ),
  };
}

describe("deployment archive and prune", () => {
  test("[DEP-ARCHIVE-001] archives a terminal deployment and hides it from default list", async () => {
    const { context, eventBus, repository, useCase } = createArchiveHarness();

    const result = await useCase.execute(context, {
      deploymentId: "dep_archive",
      confirm: "dep_archive",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      id: "dep_archive",
      archivedAt: "2026-01-01T00:01:00.000Z",
    });
    expect(repository.items.get("dep_archive")?.toState().archivedAt?.value).toBe(
      "2026-01-01T00:01:00.000Z",
    );
    expect(eventBus.events.map((event) => (event as { type: string }).type)).toContain(
      "deployment.archived",
    );

    const listService = new ListDeploymentsQueryService(new MemoryDeploymentReadModel(repository));
    await repository.insertOne({} as RepositoryContext, deployment({ id: "dep_visible" }), {
      accept: () => ({}) as never,
    });

    const visible = await listService.execute(context, {});
    const all = await listService.execute(context, { includeArchived: true });

    expect(visible.items.map((item) => item.id)).toEqual(["dep_visible"]);
    expect(all.items.map((item) => item.id).sort()).toEqual(["dep_archive", "dep_visible"]);
    expect(all.items.find((item) => item.id === "dep_archive")?.archivedAt).toBe(
      "2026-01-01T00:01:00.000Z",
    );
  });

  test("[DEP-ARCHIVE-002] rejects non-terminal deployment archive", async () => {
    const { context, repository, useCase } = createArchiveHarness({
      source: deployment({ status: "running" }),
    });

    const result = await useCase.execute(context, {
      deploymentId: "dep_archive",
      confirm: "dep_archive",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe("deployment_archive_not_allowed");
    expect(repository.items.get("dep_archive")?.toState().archivedAt).toBeUndefined();
  });

  test("[DEP-PRUNE-001] dry-runs archived deployment attempt prune by default", async () => {
    const store = new RecordingDeploymentAttemptRetentionStore({
      matchedCount: 3,
      guardedCount: 1,
      prunedCount: 0,
      affectedDeploymentIds: ["dep_old_one", "dep_old_two"],
      guardedDeploymentIds: ["dep_guarded"],
    });
    const useCase = new PruneDeploymentsUseCase(store, new FixedClock("2026-01-01T00:10:00.000Z"));
    const context = createExecutionContext({
      requestId: "req_prune_deployment_test",
      entrypoint: "system",
    });
    const command = PruneDeploymentsCommand.create({
      before: "2026-01-01T00:05:00.000Z",
      resourceId: "res_demo",
    })._unsafeUnwrap();

    const result = await useCase.execute(context, command);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      schemaVersion: "deployments.prune/v1",
      before: "2026-01-01T00:05:00.000Z",
      resourceId: "res_demo",
      dryRun: true,
      matchedCount: 3,
      guardedCount: 1,
      prunedCount: 0,
      affectedDeploymentIds: ["dep_old_one", "dep_old_two"],
      guardedDeploymentIds: ["dep_guarded"],
      prunedAt: "2026-01-01T00:10:00.000Z",
    });
    expect(store.inputs).toEqual([
      {
        before: "2026-01-01T00:05:00.000Z",
        resourceId: "res_demo",
        dryRun: true,
      },
    ]);
  });
});
