import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  AccessRoute,
  BuildStrategyKindValue,
  ConfigScopeValue,
  CreatedAt,
  Deployment,
  DeploymentId,
  DeploymentTargetDescriptor,
  DeploymentTargetId,
  DestinationId,
  DetectSummary,
  DisplayNameText,
  domainError,
  EdgeProxyKindValue,
  EnvironmentConfigSnapshot,
  EnvironmentId,
  EnvironmentSnapshotId,
  ErrorCodeText,
  ExecutionResult,
  ExecutionStatusValue,
  ExecutionStrategyKindValue,
  ExitCode,
  err,
  FinishedAt,
  GeneratedAt,
  ImageReference,
  ok,
  PackagingModeValue,
  PlanStepText,
  PortNumber,
  ProjectId,
  ProviderKey,
  PublicDomainName,
  ResourceId,
  type Result,
  RoutePathPrefix,
  RuntimeExecutionPlan,
  RuntimePlan,
  RuntimePlanId,
  SourceDescriptor,
  SourceKindValue,
  SourceLocator,
  StartedAt,
  TargetKindValue,
  TlsModeValue,
  UpsertDeploymentSpec,
} from "@appaloft/core";
import { MemoryDeploymentRepository } from "@appaloft/testkit";

import { createExecutionContext, toRepositoryContext } from "../src/execution-context";
import {
  type ExecutionBackend,
  type ServerAppliedRouteDesiredStateRecord,
  type ServerAppliedRouteStateStore,
  type SourceLinkRecord,
  type SourceLinkStore,
} from "../src/ports";
import { CleanupPreviewUseCase } from "../src/use-cases";

function createRuntimePlan(): RuntimePlan {
  const accessRoute = AccessRoute.create({
    proxyKind: EdgeProxyKindValue.rehydrate("traefik"),
    domains: [PublicDomainName.create("14.preview.appaloft.com")._unsafeUnwrap()],
    pathPrefix: RoutePathPrefix.create("/")._unsafeUnwrap(),
    tlsMode: TlsModeValue.rehydrate("auto"),
    targetPort: PortNumber.rehydrate(4321),
  })._unsafeUnwrap();

  return RuntimePlan.create({
    id: RuntimePlanId.rehydrate("plan_preview_1"),
    source: SourceDescriptor.rehydrate({
      kind: SourceKindValue.rehydrate("local-folder"),
      locator: SourceLocator.rehydrate("."),
      displayName: DisplayNameText.rehydrate("workspace"),
    }),
    buildStrategy: BuildStrategyKindValue.rehydrate("dockerfile"),
    packagingMode: PackagingModeValue.rehydrate("all-in-one-docker"),
    execution: RuntimeExecutionPlan.rehydrate({
      kind: ExecutionStrategyKindValue.rehydrate("docker-container"),
      image: ImageReference.rehydrate("appaloft:test"),
      port: PortNumber.rehydrate(4321),
      accessRoutes: [accessRoute],
      metadata: {
        "access.routeSource": "server-applied-config-domain",
      },
    }),
    target: DeploymentTargetDescriptor.rehydrate({
      kind: TargetKindValue.rehydrate("single-server"),
      providerKey: ProviderKey.rehydrate("generic-ssh"),
      serverIds: [DeploymentTargetId.rehydrate("srv_preview_1")],
    }),
    detectSummary: DetectSummary.rehydrate("preview workspace"),
    steps: [PlanStepText.rehydrate("Deploy preview container")],
    generatedAt: GeneratedAt.rehydrate("2026-04-21T00:00:00.000Z"),
  })._unsafeUnwrap();
}

function createSucceededDeployment(): Deployment {
  const deployment = Deployment.create({
    id: DeploymentId.rehydrate("dep_preview_1"),
    projectId: ProjectId.rehydrate("prj_preview_1"),
    environmentId: EnvironmentId.rehydrate("env_preview_1"),
    resourceId: ResourceId.rehydrate("res_preview_1"),
    serverId: DeploymentTargetId.rehydrate("srv_preview_1"),
    destinationId: DestinationId.rehydrate("dst_preview_1"),
    runtimePlan: createRuntimePlan(),
    environmentSnapshot: EnvironmentConfigSnapshot.rehydrate({
      id: EnvironmentSnapshotId.rehydrate("snap_preview_1"),
      environmentId: EnvironmentId.rehydrate("env_preview_1"),
      createdAt: GeneratedAt.rehydrate("2026-04-21T00:00:00.000Z"),
      precedence: [ConfigScopeValue.rehydrate("environment")],
      variables: [],
    }),
    createdAt: CreatedAt.rehydrate("2026-04-21T00:00:00.000Z"),
  })._unsafeUnwrap();

  deployment.markPlanning(StartedAt.rehydrate("2026-04-21T00:01:00.000Z"));
  deployment.markPlanned(StartedAt.rehydrate("2026-04-21T00:01:10.000Z"));
  deployment.start(StartedAt.rehydrate("2026-04-21T00:02:00.000Z"));
  deployment.applyExecutionResult(
    FinishedAt.rehydrate("2026-04-21T00:03:00.000Z"),
    ExecutionResult.rehydrate({
      exitCode: ExitCode.rehydrate(0),
      status: ExecutionStatusValue.rehydrate("succeeded"),
      logs: [],
      retryable: false,
      errorCode: ErrorCodeText.rehydrate("none"),
    }),
  );

  return deployment;
}

class MemorySourceLinkStore implements SourceLinkStore {
  readonly unlinked: string[] = [];

  constructor(private record: SourceLinkRecord | null) {}

  async read(): Promise<Result<SourceLinkRecord | null>> {
    return ok(this.record);
  }

  async requireSameTargetOrMissing(): Promise<Result<SourceLinkRecord | null>> {
    return ok(this.record);
  }

  async createIfMissing(): Promise<Result<SourceLinkRecord>> {
    if (!this.record) {
      throw new Error("Unexpected createIfMissing call");
    }
    return ok(this.record);
  }

  async relink(): Promise<Result<SourceLinkRecord>> {
    if (!this.record) {
      throw new Error("Unexpected relink call");
    }
    return ok(this.record);
  }

  async unlink(sourceFingerprint: string): Promise<Result<boolean>> {
    if (!this.record || this.record.sourceFingerprint !== sourceFingerprint) {
      return ok(false);
    }

    this.unlinked.push(sourceFingerprint);
    this.record = null;
    return ok(true);
  }
}

class CapturingServerAppliedRouteStateStore implements ServerAppliedRouteStateStore {
  readonly deletedTargets: Array<Parameters<ServerAppliedRouteStateStore["deleteDesired"]>[0]> = [];

  constructor(private readonly deleteResult: Result<boolean> = ok(true)) {}

  async upsertDesired(): Promise<Result<ServerAppliedRouteDesiredStateRecord>> {
    throw new Error("Unexpected upsertDesired call");
  }

  async read(): Promise<Result<ServerAppliedRouteDesiredStateRecord | null>> {
    return ok(null);
  }

  async markApplied(): Promise<Result<ServerAppliedRouteDesiredStateRecord | null>> {
    return ok(null);
  }

  async markFailed(): Promise<Result<ServerAppliedRouteDesiredStateRecord | null>> {
    return ok(null);
  }

  async deleteDesired(
    target: Parameters<ServerAppliedRouteStateStore["deleteDesired"]>[0],
  ): Promise<Result<boolean>> {
    this.deletedTargets.push(target);
    return this.deleteResult;
  }
}

class CapturingExecutionBackend implements ExecutionBackend {
  readonly canceledDeploymentIds: string[] = [];

  constructor(private readonly cancelResult: Result<{ logs: [] }> = ok({ logs: [] })) {}

  async execute(): Promise<Result<{ deployment: Deployment }>> {
    throw new Error("Unexpected execute call");
  }

  async cancel(_context: unknown, deployment: Deployment): Promise<Result<{ logs: [] }>> {
    this.canceledDeploymentIds.push(deployment.toState().id.value);
    return this.cancelResult;
  }

  async rollback(): Promise<Result<{ deployment: Deployment }>> {
    throw new Error("Unexpected rollback call");
  }
}

describe("CleanupPreviewUseCase", () => {
  test("[DEPLOYMENTS-CLEANUP-PREVIEW-001][CONFIG-FILE-ENTRY-019] returns already-clean when no preview source link exists", async () => {
    const sourceLinkStore = new MemorySourceLinkStore(null);
    const routeStore = new CapturingServerAppliedRouteStateStore();
    const executionBackend = new CapturingExecutionBackend();
    const deployments = new MemoryDeploymentRepository();
    const useCase = new CleanupPreviewUseCase(
      sourceLinkStore,
      routeStore,
      deployments,
      executionBackend,
    );
    const context = createExecutionContext({
      entrypoint: "cli",
      requestId: "req_preview_cleanup_missing_link",
    });

    const result = await useCase.execute(context, {
      sourceFingerprint:
        "source-fingerprint:v1:preview%3Apr%3A14:github:repo:.:appaloft.preview.yml",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      sourceFingerprint:
        "source-fingerprint:v1:preview%3Apr%3A14:github:repo:.:appaloft.preview.yml",
      status: "already-clean",
      cleanedRuntime: false,
      removedServerAppliedRoute: false,
      removedSourceLink: false,
    });
    expect(executionBackend.canceledDeploymentIds).toEqual([]);
    expect(routeStore.deletedTargets).toEqual([]);
    expect(sourceLinkStore.unlinked).toEqual([]);
  });

  test("[DEPLOYMENTS-CLEANUP-PREVIEW-002][CONFIG-FILE-ENTRY-019] cleans runtime, route state, and source link for a preview", async () => {
    const sourceLinkStore = new MemorySourceLinkStore({
      sourceFingerprint:
        "source-fingerprint:v1:preview%3Apr%3A14:github:repo:.:appaloft.preview.yml",
      projectId: "prj_preview_1",
      environmentId: "env_preview_1",
      resourceId: "res_preview_1",
      serverId: "srv_preview_1",
      destinationId: "dst_preview_1",
      updatedAt: "2026-04-21T00:00:00.000Z",
    });
    const routeStore = new CapturingServerAppliedRouteStateStore();
    const executionBackend = new CapturingExecutionBackend();
    const deployments = new MemoryDeploymentRepository();
    const context = createExecutionContext({
      entrypoint: "cli",
      requestId: "req_preview_cleanup_success",
    });
    const deployment = createSucceededDeployment();
    await deployments.upsert(
      toRepositoryContext(context),
      deployment,
      UpsertDeploymentSpec.fromDeployment(deployment),
    );

    const useCase = new CleanupPreviewUseCase(
      sourceLinkStore,
      routeStore,
      deployments,
      executionBackend,
    );
    const result = await useCase.execute(context, {
      sourceFingerprint:
        "source-fingerprint:v1:preview%3Apr%3A14:github:repo:.:appaloft.preview.yml",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      sourceFingerprint:
        "source-fingerprint:v1:preview%3Apr%3A14:github:repo:.:appaloft.preview.yml",
      status: "cleaned",
      cleanedRuntime: true,
      removedServerAppliedRoute: true,
      removedSourceLink: true,
      projectId: "prj_preview_1",
      environmentId: "env_preview_1",
      resourceId: "res_preview_1",
      serverId: "srv_preview_1",
      destinationId: "dst_preview_1",
      deploymentId: "dep_preview_1",
    });
    expect(executionBackend.canceledDeploymentIds).toEqual(["dep_preview_1"]);
    expect(routeStore.deletedTargets).toEqual([
      {
        projectId: "prj_preview_1",
        environmentId: "env_preview_1",
        resourceId: "res_preview_1",
        serverId: "srv_preview_1",
        destinationId: "dst_preview_1",
      },
    ]);
    expect(sourceLinkStore.unlinked).toEqual([
      "source-fingerprint:v1:preview%3Apr%3A14:github:repo:.:appaloft.preview.yml",
    ]);
  });

  test("[DEPLOYMENTS-CLEANUP-PREVIEW-003][CONFIG-FILE-ENTRY-019] stops cleanup when runtime cancellation fails", async () => {
    const sourceLinkStore = new MemorySourceLinkStore({
      sourceFingerprint:
        "source-fingerprint:v1:preview%3Apr%3A14:github:repo:.:appaloft.preview.yml",
      projectId: "prj_preview_1",
      environmentId: "env_preview_1",
      resourceId: "res_preview_1",
      serverId: "srv_preview_1",
      destinationId: "dst_preview_1",
      updatedAt: "2026-04-21T00:00:00.000Z",
    });
    const routeStore = new CapturingServerAppliedRouteStateStore();
    const executionBackend = new CapturingExecutionBackend(
      err(
        domainError.infra("Container removal failed", {
          phase: "runtime-execution",
        }),
      ),
    );
    const deployments = new MemoryDeploymentRepository();
    const context = createExecutionContext({
      entrypoint: "cli",
      requestId: "req_preview_cleanup_runtime_failure",
    });
    const deployment = createSucceededDeployment();
    await deployments.upsert(
      toRepositoryContext(context),
      deployment,
      UpsertDeploymentSpec.fromDeployment(deployment),
    );

    const useCase = new CleanupPreviewUseCase(
      sourceLinkStore,
      routeStore,
      deployments,
      executionBackend,
    );
    const result = await useCase.execute(context, {
      sourceFingerprint:
        "source-fingerprint:v1:preview%3Apr%3A14:github:repo:.:appaloft.preview.yml",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "infra_error",
      details: {
        phase: "preview-cleanup",
        cleanupStage: "runtime-cleanup",
        deploymentId: "dep_preview_1",
      },
    });
    expect(routeStore.deletedTargets).toEqual([]);
    expect(sourceLinkStore.unlinked).toEqual([]);
  });
});
