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
  type DeploymentReadModel,
  type ExecutionBackend,
  type ServerAppliedRouteDesiredStateRecord,
  ServerAppliedRouteStateBySourceFingerprintSpec,
  type ServerAppliedRouteStateByTargetSpec,
  type ServerAppliedRouteStateRepository,
  type ServerAppliedRouteStateSelectionSpec,
  type SourceLinkBySourceFingerprintSpec,
  type SourceLinkRecord,
  type SourceLinkRepository,
} from "../src/ports";
import { CleanupPreviewUseCase } from "../src/use-cases";

const previewSourceFingerprint =
  "source-fingerprint:v1:preview%3Apr%3A14:github:repo:.:appaloft.preview.yml";

function createRuntimePlan(input?: {
  planId?: string;
  domain?: string;
  generatedAt?: string;
  metadata?: Record<string, string>;
}): RuntimePlan {
  const accessRoute = AccessRoute.create({
    proxyKind: EdgeProxyKindValue.rehydrate("traefik"),
    domains: [PublicDomainName.create(input?.domain ?? "14.preview.appaloft.com")._unsafeUnwrap()],
    pathPrefix: RoutePathPrefix.create("/")._unsafeUnwrap(),
    tlsMode: TlsModeValue.rehydrate("auto"),
    targetPort: PortNumber.rehydrate(4321),
  })._unsafeUnwrap();

  return RuntimePlan.create({
    id: RuntimePlanId.rehydrate(input?.planId ?? "plan_preview_1"),
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
        ...(input?.metadata ?? {}),
      },
    }),
    target: DeploymentTargetDescriptor.rehydrate({
      kind: TargetKindValue.rehydrate("single-server"),
      providerKey: ProviderKey.rehydrate("generic-ssh"),
      serverIds: [DeploymentTargetId.rehydrate("srv_preview_1")],
    }),
    detectSummary: DetectSummary.rehydrate("preview workspace"),
    steps: [PlanStepText.rehydrate("Deploy preview container")],
    generatedAt: GeneratedAt.rehydrate(input?.generatedAt ?? "2026-04-21T00:00:00.000Z"),
  })._unsafeUnwrap();
}

function createSucceededDeployment(input?: {
  deploymentId?: string;
  projectId?: string;
  environmentId?: string;
  resourceId?: string;
  serverId?: string;
  destinationId?: string;
  createdAt?: string;
  planId?: string;
  domain?: string;
  generatedAt?: string;
  metadata?: Record<string, string>;
}): Deployment {
  const deployment = Deployment.create({
    id: DeploymentId.rehydrate(input?.deploymentId ?? "dep_preview_1"),
    projectId: ProjectId.rehydrate(input?.projectId ?? "prj_preview_1"),
    environmentId: EnvironmentId.rehydrate(input?.environmentId ?? "env_preview_1"),
    resourceId: ResourceId.rehydrate(input?.resourceId ?? "res_preview_1"),
    serverId: DeploymentTargetId.rehydrate(input?.serverId ?? "srv_preview_1"),
    destinationId: DestinationId.rehydrate(input?.destinationId ?? "dst_preview_1"),
    runtimePlan: createRuntimePlan({
      ...(input?.planId ? { planId: input.planId } : {}),
      ...(input?.domain ? { domain: input.domain } : {}),
      ...(input?.generatedAt ? { generatedAt: input.generatedAt } : {}),
      ...(input?.metadata ? { metadata: input.metadata } : {}),
    }),
    environmentSnapshot: EnvironmentConfigSnapshot.rehydrate({
      id: EnvironmentSnapshotId.rehydrate("snap_preview_1"),
      environmentId: EnvironmentId.rehydrate(input?.environmentId ?? "env_preview_1"),
      createdAt: GeneratedAt.rehydrate("2026-04-21T00:00:00.000Z"),
      precedence: [ConfigScopeValue.rehydrate("environment")],
      variables: [],
    }),
    createdAt: CreatedAt.rehydrate(input?.createdAt ?? "2026-04-21T00:00:00.000Z"),
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

function createDeploymentSummary(input?: {
  deploymentId?: string;
  projectId?: string;
  environmentId?: string;
  resourceId?: string;
  serverId?: string;
  destinationId?: string;
  createdAt?: string;
  startedAt?: string;
  finishedAt?: string;
  planId?: string;
  generatedAt?: string;
  domain?: string;
  metadata?: Record<string, string>;
}): Awaited<ReturnType<DeploymentReadModel["list"]>>[number] {
  return {
    id: input?.deploymentId ?? "dep_preview_1",
    projectId: input?.projectId ?? "prj_preview_1",
    environmentId: input?.environmentId ?? "env_preview_1",
    resourceId: input?.resourceId ?? "res_preview_1",
    serverId: input?.serverId ?? "srv_preview_1",
    destinationId: input?.destinationId ?? "dst_preview_1",
    status: "succeeded",
    runtimePlan: {
      id: input?.planId ?? "plan_preview_1",
      source: {
        kind: "local-folder",
        locator: ".",
        displayName: "workspace",
      },
      buildStrategy: "dockerfile",
      packagingMode: "all-in-one-docker",
      execution: {
        kind: "docker-container",
        image: "appaloft:test",
        port: 4321,
        accessRoutes: [
          {
            proxyKind: "traefik",
            domains: [input?.domain ?? "14.preview.appaloft.com"],
            pathPrefix: "/",
            tlsMode: "auto",
            targetPort: 4321,
          },
        ],
        metadata: {
          "access.routeSource": "server-applied-config-domain",
          ...(input?.metadata ?? {}),
        },
      },
      target: {
        kind: "single-server",
        providerKey: "generic-ssh",
        serverIds: [input?.serverId ?? "srv_preview_1"],
      },
      detectSummary: "preview workspace",
      generatedAt: input?.generatedAt ?? "2026-04-21T00:00:00.000Z",
      steps: ["Deploy preview container"],
    },
    environmentSnapshot: {
      id: "snap_preview_1",
      environmentId: input?.environmentId ?? "env_preview_1",
      createdAt: "2026-04-21T00:00:00.000Z",
      precedence: ["environment"],
      variables: [],
    },
    logs: [],
    logCount: 0,
    createdAt: input?.createdAt ?? "2026-04-21T00:00:00.000Z",
    startedAt: input?.startedAt ?? "2026-04-21T00:02:00.000Z",
    finishedAt: input?.finishedAt ?? "2026-04-21T00:03:00.000Z",
  };
}

class MemorySourceLinkRepository implements SourceLinkRepository {
  readonly deletedFingerprints: string[] = [];

  constructor(private record: SourceLinkRecord | null) {}

  async findOne(spec: SourceLinkBySourceFingerprintSpec): Promise<Result<SourceLinkRecord | null>> {
    if (!this.record || this.record.sourceFingerprint !== spec.sourceFingerprint) {
      return ok(null);
    }

    return ok(this.record);
  }

  async upsert(record: SourceLinkRecord): Promise<Result<SourceLinkRecord>> {
    this.record = record;
    return ok(record);
  }

  async deleteOne(spec: SourceLinkBySourceFingerprintSpec): Promise<Result<boolean>> {
    if (!this.record || this.record.sourceFingerprint !== spec.sourceFingerprint) {
      return ok(false);
    }

    this.deletedFingerprints.push(spec.sourceFingerprint);
    this.record = null;
    return ok(true);
  }
}

class CapturingServerAppliedRouteStateRepository implements ServerAppliedRouteStateRepository {
  readonly deletedTargets: ServerAppliedRouteStateByTargetSpec["target"][] = [];
  readonly deletedSourceFingerprints: string[] = [];

  constructor(
    private readonly deleteResult: Result<boolean> = ok(true),
    private readonly deleteManyResult: Result<number> = ok(0),
  ) {}

  async upsert(): Promise<Result<ServerAppliedRouteDesiredStateRecord>> {
    throw new Error("Unexpected upsertDesired call");
  }

  async findOne(): Promise<Result<ServerAppliedRouteDesiredStateRecord | null>> {
    return ok(null);
  }

  async updateOne(): Promise<Result<ServerAppliedRouteDesiredStateRecord | null>> {
    return ok(null);
  }

  async deleteOne(spec: ServerAppliedRouteStateSelectionSpec): Promise<Result<boolean>> {
    if ("target" in spec) {
      this.deletedTargets.push(spec.target);
      return this.deleteResult;
    }

    throw new Error("Unexpected deleteOne spec");
  }

  async deleteMany(spec: ServerAppliedRouteStateSelectionSpec): Promise<Result<number>> {
    if (spec instanceof ServerAppliedRouteStateBySourceFingerprintSpec) {
      this.deletedSourceFingerprints.push(spec.sourceFingerprint);
      return this.deleteManyResult;
    }

    throw new Error("Unexpected deleteMany spec");
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

class MemoryDeploymentReadModel implements DeploymentReadModel {
  constructor(private readonly items: Awaited<ReturnType<DeploymentReadModel["list"]>> = []) {}

  async list(): Promise<Awaited<ReturnType<DeploymentReadModel["list"]>>> {
    return this.items;
  }

  async findLogs(): Promise<Awaited<ReturnType<DeploymentReadModel["findLogs"]>>> {
    return [];
  }
}

describe("CleanupPreviewUseCase", () => {
  test("[DEPLOYMENTS-CLEANUP-PREVIEW-001][CONFIG-FILE-ENTRY-019] returns already-clean when no preview source link exists", async () => {
    const sourceLinkRepository = new MemorySourceLinkRepository(null);
    const routeRepository = new CapturingServerAppliedRouteStateRepository();
    const executionBackend = new CapturingExecutionBackend();
    const deployments = new MemoryDeploymentRepository();
    const deploymentReadModel = new MemoryDeploymentReadModel();
    const useCase = new CleanupPreviewUseCase(
      sourceLinkRepository,
      routeRepository,
      deployments,
      deploymentReadModel,
      executionBackend,
    );
    const context = createExecutionContext({
      entrypoint: "cli",
      requestId: "req_preview_cleanup_missing_link",
    });

    const result = await useCase.execute(context, {
      sourceFingerprint: previewSourceFingerprint,
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      sourceFingerprint: previewSourceFingerprint,
      status: "already-clean",
      cleanedRuntime: false,
      removedServerAppliedRoute: false,
      removedSourceLink: false,
    });
    expect(executionBackend.canceledDeploymentIds).toEqual([]);
    expect(routeRepository.deletedTargets).toEqual([]);
    expect(routeRepository.deletedSourceFingerprints).toEqual([]);
    expect(sourceLinkRepository.deletedFingerprints).toEqual([]);
  });

  test("[DEPLOYMENTS-CLEANUP-PREVIEW-002][CONFIG-FILE-ENTRY-019] cleans runtime, route state, and source link for a preview", async () => {
    const sourceLinkRepository = new MemorySourceLinkRepository({
      sourceFingerprint: previewSourceFingerprint,
      projectId: "prj_preview_1",
      environmentId: "env_preview_1",
      resourceId: "res_preview_1",
      serverId: "srv_preview_1",
      destinationId: "dst_preview_1",
      updatedAt: "2026-04-21T00:00:00.000Z",
    });
    const routeRepository = new CapturingServerAppliedRouteStateRepository();
    const executionBackend = new CapturingExecutionBackend();
    const deployments = new MemoryDeploymentRepository();
    const deploymentReadModel = new MemoryDeploymentReadModel();
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
      sourceLinkRepository,
      routeRepository,
      deployments,
      deploymentReadModel,
      executionBackend,
    );
    const result = await useCase.execute(context, {
      sourceFingerprint: previewSourceFingerprint,
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      sourceFingerprint: previewSourceFingerprint,
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
    expect(routeRepository.deletedTargets).toEqual([
      {
        projectId: "prj_preview_1",
        environmentId: "env_preview_1",
        resourceId: "res_preview_1",
        serverId: "srv_preview_1",
        destinationId: "dst_preview_1",
      },
    ]);
    expect(routeRepository.deletedSourceFingerprints).toEqual([previewSourceFingerprint]);
    expect(sourceLinkRepository.deletedFingerprints).toEqual([previewSourceFingerprint]);
  });

  test("[DEPLOYMENTS-CLEANUP-PREVIEW-003][CONFIG-FILE-ENTRY-019] stops cleanup when runtime cancellation fails", async () => {
    const sourceLinkRepository = new MemorySourceLinkRepository({
      sourceFingerprint: previewSourceFingerprint,
      projectId: "prj_preview_1",
      environmentId: "env_preview_1",
      resourceId: "res_preview_1",
      serverId: "srv_preview_1",
      destinationId: "dst_preview_1",
      updatedAt: "2026-04-21T00:00:00.000Z",
    });
    const routeRepository = new CapturingServerAppliedRouteStateRepository();
    const executionBackend = new CapturingExecutionBackend(
      err(
        domainError.infra("Container removal failed", {
          phase: "runtime-execution",
        }),
      ),
    );
    const deployments = new MemoryDeploymentRepository();
    const deploymentReadModel = new MemoryDeploymentReadModel();
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
      sourceLinkRepository,
      routeRepository,
      deployments,
      deploymentReadModel,
      executionBackend,
    );
    const result = await useCase.execute(context, {
      sourceFingerprint: previewSourceFingerprint,
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
    expect(routeRepository.deletedTargets).toEqual([]);
    expect(routeRepository.deletedSourceFingerprints).toEqual([]);
    expect(sourceLinkRepository.deletedFingerprints).toEqual([]);
  });

  test("[DEPLOYMENTS-CLEANUP-PREVIEW-004][CONFIG-FILE-ENTRY-019] sweeps stale preview runtime and route state for the same preview fingerprint", async () => {
    const sourceLinkRepository = new MemorySourceLinkRepository({
      sourceFingerprint: previewSourceFingerprint,
      projectId: "prj_preview_1",
      environmentId: "env_preview_1",
      resourceId: "res_preview_current",
      serverId: "srv_preview_1",
      destinationId: "dst_preview_1",
      updatedAt: "2026-04-21T00:00:00.000Z",
    });
    const routeRepository = new CapturingServerAppliedRouteStateRepository(ok(true), ok(1));
    const executionBackend = new CapturingExecutionBackend();
    const deployments = new MemoryDeploymentRepository();
    const deploymentReadModel = new MemoryDeploymentReadModel([
      createDeploymentSummary({
        deploymentId: "dep_preview_old",
        planId: "plan_preview_old",
        resourceId: "res_preview_old",
        createdAt: "2026-04-20T23:00:00.000Z",
        generatedAt: "2026-04-20T23:00:00.000Z",
        domain: "old.14.preview.appaloft.com",
        metadata: {
          "access.sourceFingerprint": previewSourceFingerprint,
          "preview.id": "pr-14",
          "preview.mode": "pull-request",
        },
      }),
      createDeploymentSummary({
        deploymentId: "dep_preview_current",
        planId: "plan_preview_current",
        resourceId: "res_preview_current",
        createdAt: "2026-04-21T00:00:00.000Z",
        generatedAt: "2026-04-21T00:00:00.000Z",
        metadata: {
          "access.sourceFingerprint": previewSourceFingerprint,
          "preview.id": "pr-14",
          "preview.mode": "pull-request",
        },
      }),
    ]);
    const context = createExecutionContext({
      entrypoint: "cli",
      requestId: "req_preview_cleanup_sweep",
    });
    const currentDeployment = createSucceededDeployment({
      deploymentId: "dep_preview_current",
      planId: "plan_preview_current",
      resourceId: "res_preview_current",
      createdAt: "2026-04-21T00:00:00.000Z",
      generatedAt: "2026-04-21T00:00:00.000Z",
      metadata: {
        "access.sourceFingerprint": previewSourceFingerprint,
        "preview.id": "pr-14",
        "preview.mode": "pull-request",
      },
    });
    const oldDeployment = createSucceededDeployment({
      deploymentId: "dep_preview_old",
      planId: "plan_preview_old",
      resourceId: "res_preview_old",
      createdAt: "2026-04-20T23:00:00.000Z",
      generatedAt: "2026-04-20T23:00:00.000Z",
      domain: "old.14.preview.appaloft.com",
      metadata: {
        "access.sourceFingerprint": previewSourceFingerprint,
        "preview.id": "pr-14",
        "preview.mode": "pull-request",
      },
    });
    await deployments.upsert(
      toRepositoryContext(context),
      currentDeployment,
      UpsertDeploymentSpec.fromDeployment(currentDeployment),
    );
    await deployments.upsert(
      toRepositoryContext(context),
      oldDeployment,
      UpsertDeploymentSpec.fromDeployment(oldDeployment),
    );

    const useCase = new CleanupPreviewUseCase(
      sourceLinkRepository,
      routeRepository,
      deployments,
      deploymentReadModel,
      executionBackend,
    );
    const result = await useCase.execute(context, {
      sourceFingerprint: previewSourceFingerprint,
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      sourceFingerprint: previewSourceFingerprint,
      status: "cleaned",
      cleanedRuntime: true,
      removedServerAppliedRoute: true,
      removedSourceLink: true,
      resourceId: "res_preview_current",
      deploymentId: "dep_preview_current",
    });
    expect(executionBackend.canceledDeploymentIds).toEqual([
      "dep_preview_current",
      "dep_preview_old",
    ]);
    expect(routeRepository.deletedTargets).toEqual([
      {
        projectId: "prj_preview_1",
        environmentId: "env_preview_1",
        resourceId: "res_preview_current",
        serverId: "srv_preview_1",
        destinationId: "dst_preview_1",
      },
    ]);
    expect(routeRepository.deletedSourceFingerprints).toEqual([previewSourceFingerprint]);
    expect(sourceLinkRepository.deletedFingerprints).toEqual([previewSourceFingerprint]);
  });
});
