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
import { MemoryDeploymentRepository, PassThroughMutationCoordinator } from "@appaloft/testkit";

import { createExecutionContext, toRepositoryContext } from "../src/execution-context";
import {
  type DeploymentReadModel,
  type ExecutionBackend,
  type ServerAppliedRouteDesiredStateRecord,
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
    const unsupported: Result<boolean> = err(
      domainError.validation("Unsupported route-state selection spec for test repository", {
        phase: "test-double",
      }),
    );

    return spec.accept<Result<boolean>>(unsupported, {
      visitServerAppliedRouteStateByTarget: (_query, targetSpec) => {
        this.deletedTargets.push(targetSpec.target);
        return this.deleteResult;
      },
      visitServerAppliedRouteStateByRouteSetId: () => unsupported,
      visitServerAppliedRouteStateBySourceFingerprint: () => unsupported,
    });
  }

  async deleteMany(spec: ServerAppliedRouteStateSelectionSpec): Promise<Result<number>> {
    const unsupported: Result<number> = err(
      domainError.validation("Unsupported route-state selection spec for test repository", {
        phase: "test-double",
      }),
    );

    return spec.accept<Result<number>>(unsupported, {
      visitServerAppliedRouteStateByTarget: () => unsupported,
      visitServerAppliedRouteStateByRouteSetId: () => unsupported,
      visitServerAppliedRouteStateBySourceFingerprint: (_query, sourceFingerprintSpec) => {
        this.deletedSourceFingerprints.push(sourceFingerprintSpec.sourceFingerprint);
        return this.deleteManyResult;
      },
    });
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

class CapturingUnbindDependencyUseCase {
  readonly calls: Array<{ resourceId: string; bindingId: string }> = [];

  constructor(private readonly result: Result<{ id: string }> = ok({ id: "rbd_preview_db" })) {}

  async execute(
    _context: unknown,
    input: { resourceId: string; bindingId: string },
  ): Promise<Result<{ id: string }>> {
    this.calls.push(input);
    return this.result;
  }
}

class CapturingDeleteDependencyResourceUseCase {
  readonly calls: Array<{ dependencyResourceId: string }> = [];

  constructor(private readonly result: Result<{ id: string }> = ok({ id: "dep_res_preview_db" })) {}

  async execute(
    _context: unknown,
    input: { dependencyResourceId: string },
  ): Promise<Result<{ id: string }>> {
    this.calls.push(input);
    return this.result;
  }
}

class CapturingDetachStorageUseCase {
  readonly calls: Array<{ resourceId: string; attachmentId: string }> = [];

  constructor(
    private readonly result: Result<{ id: string }> = ok({ id: "rsa_preview_uploads" }),
  ) {}

  async execute(
    _context: unknown,
    input: { resourceId: string; attachmentId: string },
  ): Promise<Result<{ id: string }>> {
    this.calls.push(input);
    return this.result;
  }
}

class CapturingDeleteStorageVolumeUseCase {
  readonly calls: Array<{ storageVolumeId: string }> = [];

  constructor(
    private readonly result: Result<{ id: string }> = ok({ id: "stv_preview_uploads" }),
  ) {}

  async execute(
    _context: unknown,
    input: { storageVolumeId: string },
  ): Promise<Result<{ id: string }>> {
    this.calls.push(input);
    return this.result;
  }
}

class CapturingDeleteScheduledTaskUseCase {
  readonly calls: Array<{ resourceId: string; taskId: string }> = [];

  constructor(
    private readonly result: Result<{
      schemaVersion: "scheduled-tasks.delete/v1";
      taskId: string;
      resourceId: string;
      status: "deleted";
      deletedAt: string;
    }> = ok({
      schemaVersion: "scheduled-tasks.delete/v1",
      taskId: "tsk_preview_sync",
      resourceId: "res_preview_1",
      status: "deleted",
      deletedAt: "2026-04-21T00:00:00.000Z",
    }),
  ) {}

  async execute(
    _context: unknown,
    input: { resourceId: string; taskId: string },
  ): Promise<
    Result<{
      schemaVersion: "scheduled-tasks.delete/v1";
      taskId: string;
      resourceId: string;
      status: "deleted";
      deletedAt: string;
    }>
  > {
    this.calls.push(input);
    return this.result;
  }
}

class MemoryDeploymentReadModel implements DeploymentReadModel {
  async count(): Promise<number> {
    return 0;
  }

  constructor(private readonly items: Awaited<ReturnType<DeploymentReadModel["list"]>> = []) {}

  async list(): Promise<Awaited<ReturnType<DeploymentReadModel["list"]>>> {
    return this.items;
  }

  async findOne(): Promise<Awaited<ReturnType<DeploymentReadModel["findOne"]>>> {
    return null;
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
      new PassThroughMutationCoordinator(),
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
      removedDependencyBindings: 0,
      deletedDependencyResources: 0,
      removedStorageAttachments: 0,
      deletedStorageVolumes: 0,
      deletedScheduledTasks: 0,
    });
    expect(executionBackend.canceledDeploymentIds).toEqual([]);
    expect(routeRepository.deletedTargets).toEqual([]);
    expect(routeRepository.deletedSourceFingerprints).toEqual([]);
    expect(sourceLinkRepository.deletedFingerprints).toEqual([]);
  });

  test("[DEPLOYMENTS-CLEANUP-PREVIEW-011] cleans only provenance-owned ephemeral dependencies", async () => {
    const sourceLinkRepository = new MemorySourceLinkRepository({
      sourceFingerprint: previewSourceFingerprint,
      projectId: "prj_preview_1",
      environmentId: "env_preview_1",
      resourceId: "res_preview_1",
      serverId: "srv_preview_1",
      destinationId: "dst_preview_1",
      updatedAt: "2026-04-21T00:00:00.000Z",
      dependencyProvenance: {
        schemaVersion: "source-link.dependency-provenance/v1",
        source: "repository-config",
        sourceFingerprint: previewSourceFingerprint,
        entries: [
          {
            key: "db",
            kind: "postgres",
            source: "managed",
            lifecycle: "ephemeral",
            resourceId: "res_preview_1",
            dependencyResourceId: "dep_res_preview_db",
            bindingId: "rbd_preview_db",
            targetName: "DATABASE_URL",
            createdAt: "2026-04-21T00:00:00.000Z",
          },
        ],
      },
    });
    const routeRepository = new CapturingServerAppliedRouteStateRepository();
    const executionBackend = new CapturingExecutionBackend();
    const deployments = new MemoryDeploymentRepository();
    const deploymentReadModel = new MemoryDeploymentReadModel();
    const unbindDependency = new CapturingUnbindDependencyUseCase();
    const deleteDependency = new CapturingDeleteDependencyResourceUseCase();
    const context = createExecutionContext({
      entrypoint: "cli",
      requestId: "req_preview_cleanup_dependency",
    });

    const useCase = new CleanupPreviewUseCase(
      sourceLinkRepository,
      routeRepository,
      deployments,
      deploymentReadModel,
      executionBackend,
      new PassThroughMutationCoordinator(),
      unbindDependency,
      deleteDependency,
    );
    const result = await useCase.execute(context, {
      sourceFingerprint: previewSourceFingerprint,
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      status: "cleaned",
      removedDependencyBindings: 1,
      deletedDependencyResources: 1,
      removedSourceLink: true,
    });
    expect(unbindDependency.calls).toEqual([
      {
        resourceId: "res_preview_1",
        bindingId: "rbd_preview_db",
      },
    ]);
    expect(deleteDependency.calls).toEqual([
      {
        dependencyResourceId: "dep_res_preview_db",
      },
    ]);
    expect(sourceLinkRepository.deletedFingerprints).toEqual([previewSourceFingerprint]);
  });

  test("[DEPLOYMENTS-CLEANUP-PREVIEW-013] cleans only provenance-owned ephemeral storage volumes", async () => {
    const sourceLinkRepository = new MemorySourceLinkRepository({
      sourceFingerprint: previewSourceFingerprint,
      projectId: "prj_preview_1",
      environmentId: "env_preview_1",
      resourceId: "res_preview_1",
      serverId: "srv_preview_1",
      updatedAt: "2026-04-21T00:00:00.000Z",
      storageProvenance: {
        schemaVersion: "source-link.storage-provenance/v1",
        source: "repository-config",
        sourceFingerprint: previewSourceFingerprint,
        entries: [
          {
            key: "uploads",
            kind: "volume",
            source: "managed",
            lifecycle: "ephemeral",
            resourceId: "res_preview_1",
            storageVolumeId: "stv_preview_uploads",
            attachmentId: "rsa_preview_uploads",
            destinationPath: "/app/uploads",
            createdAt: "2026-04-21T00:00:00.000Z",
          },
        ],
      },
    });
    const routeRepository = new CapturingServerAppliedRouteStateRepository();
    const executionBackend = new CapturingExecutionBackend();
    const deployments = new MemoryDeploymentRepository();
    const deploymentReadModel = new MemoryDeploymentReadModel();
    const detachStorage = new CapturingDetachStorageUseCase();
    const deleteStorage = new CapturingDeleteStorageVolumeUseCase();
    const context = createExecutionContext({
      entrypoint: "cli",
      requestId: "req_preview_cleanup_storage",
    });

    const useCase = new CleanupPreviewUseCase(
      sourceLinkRepository,
      routeRepository,
      deployments,
      deploymentReadModel,
      executionBackend,
      new PassThroughMutationCoordinator(),
      undefined,
      undefined,
      detachStorage,
      deleteStorage,
    );
    const result = await useCase.execute(context, {
      sourceFingerprint: previewSourceFingerprint,
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      status: "cleaned",
      removedStorageAttachments: 1,
      deletedStorageVolumes: 1,
      removedSourceLink: true,
    });
    expect(detachStorage.calls).toEqual([
      {
        resourceId: "res_preview_1",
        attachmentId: "rsa_preview_uploads",
      },
    ]);
    expect(deleteStorage.calls).toEqual([
      {
        storageVolumeId: "stv_preview_uploads",
      },
    ]);
    expect(sourceLinkRepository.deletedFingerprints).toEqual([previewSourceFingerprint]);
  });

  test("[DEPLOYMENTS-CLEANUP-PREVIEW-012] preserves dependencies without matching provenance", async () => {
    const sourceLinkRepository = new MemorySourceLinkRepository({
      sourceFingerprint: previewSourceFingerprint,
      projectId: "prj_preview_1",
      environmentId: "env_preview_1",
      resourceId: "res_preview_1",
      serverId: "srv_preview_1",
      updatedAt: "2026-04-21T00:00:00.000Z",
    });
    const routeRepository = new CapturingServerAppliedRouteStateRepository();
    const executionBackend = new CapturingExecutionBackend();
    const deployments = new MemoryDeploymentRepository();
    const deploymentReadModel = new MemoryDeploymentReadModel();
    const unbindDependency = new CapturingUnbindDependencyUseCase();
    const deleteDependency = new CapturingDeleteDependencyResourceUseCase();
    const context = createExecutionContext({
      entrypoint: "cli",
      requestId: "req_preview_cleanup_no_dependency_provenance",
    });

    const useCase = new CleanupPreviewUseCase(
      sourceLinkRepository,
      routeRepository,
      deployments,
      deploymentReadModel,
      executionBackend,
      new PassThroughMutationCoordinator(),
      unbindDependency,
      deleteDependency,
    );
    const result = await useCase.execute(context, {
      sourceFingerprint: previewSourceFingerprint,
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      removedDependencyBindings: 0,
      deletedDependencyResources: 0,
      removedSourceLink: true,
    });
    expect(unbindDependency.calls).toEqual([]);
    expect(deleteDependency.calls).toEqual([]);
  });

  test("[DEPLOYMENTS-CLEANUP-PREVIEW-014] preserves storage without matching provenance", async () => {
    const sourceLinkRepository = new MemorySourceLinkRepository({
      sourceFingerprint: previewSourceFingerprint,
      projectId: "prj_preview_1",
      environmentId: "env_preview_1",
      resourceId: "res_preview_1",
      serverId: "srv_preview_1",
      updatedAt: "2026-04-21T00:00:00.000Z",
    });
    const routeRepository = new CapturingServerAppliedRouteStateRepository();
    const executionBackend = new CapturingExecutionBackend();
    const deployments = new MemoryDeploymentRepository();
    const deploymentReadModel = new MemoryDeploymentReadModel();
    const detachStorage = new CapturingDetachStorageUseCase();
    const deleteStorage = new CapturingDeleteStorageVolumeUseCase();
    const context = createExecutionContext({
      entrypoint: "cli",
      requestId: "req_preview_cleanup_no_storage_provenance",
    });

    const useCase = new CleanupPreviewUseCase(
      sourceLinkRepository,
      routeRepository,
      deployments,
      deploymentReadModel,
      executionBackend,
      new PassThroughMutationCoordinator(),
      undefined,
      undefined,
      detachStorage,
      deleteStorage,
    );
    const result = await useCase.execute(context, {
      sourceFingerprint: previewSourceFingerprint,
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      removedStorageAttachments: 0,
      deletedStorageVolumes: 0,
      removedSourceLink: true,
    });
    expect(detachStorage.calls).toEqual([]);
    expect(deleteStorage.calls).toEqual([]);
  });

  test("[DEPLOYMENTS-CLEANUP-PREVIEW-015][SCHED-TASK-CONFIG-002] cleans only provenance-owned ephemeral scheduled tasks", async () => {
    const sourceLinkRepository = new MemorySourceLinkRepository({
      sourceFingerprint: previewSourceFingerprint,
      projectId: "prj_preview_1",
      environmentId: "env_preview_1",
      resourceId: "res_preview_1",
      serverId: "srv_preview_1",
      updatedAt: "2026-04-21T00:00:00.000Z",
      scheduledTaskProvenance: {
        schemaVersion: "source-link.scheduled-task-provenance/v1",
        source: "repository-config",
        sourceFingerprint: previewSourceFingerprint,
        entries: [
          {
            key: "nightly_sync",
            source: "repository-config",
            lifecycle: "ephemeral",
            resourceId: "res_preview_1",
            taskId: "tsk_preview_sync",
            commandFingerprint: "sha256:preview-sync",
            createdAt: "2026-04-21T00:00:00.000Z",
          },
        ],
      },
    });
    const routeRepository = new CapturingServerAppliedRouteStateRepository();
    const executionBackend = new CapturingExecutionBackend();
    const deployments = new MemoryDeploymentRepository();
    const deploymentReadModel = new MemoryDeploymentReadModel();
    const deleteScheduledTask = new CapturingDeleteScheduledTaskUseCase();
    const context = createExecutionContext({
      entrypoint: "cli",
      requestId: "req_preview_cleanup_scheduled_task",
    });

    const useCase = new CleanupPreviewUseCase(
      sourceLinkRepository,
      routeRepository,
      deployments,
      deploymentReadModel,
      executionBackend,
      new PassThroughMutationCoordinator(),
      undefined,
      undefined,
      undefined,
      undefined,
      deleteScheduledTask,
    );
    const result = await useCase.execute(context, {
      sourceFingerprint: previewSourceFingerprint,
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      status: "cleaned",
      deletedScheduledTasks: 1,
      removedSourceLink: true,
    });
    expect(deleteScheduledTask.calls).toEqual([
      {
        resourceId: "res_preview_1",
        taskId: "tsk_preview_sync",
      },
    ]);
    expect(sourceLinkRepository.deletedFingerprints).toEqual([previewSourceFingerprint]);
  });

  test("[DEPLOYMENTS-CLEANUP-PREVIEW-016] preserves scheduled tasks without matching ephemeral provenance", async () => {
    const sourceLinkRepository = new MemorySourceLinkRepository({
      sourceFingerprint: previewSourceFingerprint,
      projectId: "prj_preview_1",
      environmentId: "env_preview_1",
      resourceId: "res_preview_1",
      serverId: "srv_preview_1",
      updatedAt: "2026-04-21T00:00:00.000Z",
      scheduledTaskProvenance: {
        schemaVersion: "source-link.scheduled-task-provenance/v1",
        source: "repository-config",
        sourceFingerprint: previewSourceFingerprint,
        entries: [
          {
            key: "nightly_sync",
            source: "repository-config",
            lifecycle: "persistent",
            resourceId: "res_preview_1",
            taskId: "tsk_persistent_sync",
            commandFingerprint: "sha256:persistent-sync",
            createdAt: "2026-04-21T00:00:00.000Z",
          },
        ],
      },
    });
    const routeRepository = new CapturingServerAppliedRouteStateRepository();
    const executionBackend = new CapturingExecutionBackend();
    const deployments = new MemoryDeploymentRepository();
    const deploymentReadModel = new MemoryDeploymentReadModel();
    const deleteScheduledTask = new CapturingDeleteScheduledTaskUseCase();
    const context = createExecutionContext({
      entrypoint: "cli",
      requestId: "req_preview_cleanup_preserve_scheduled_task",
    });

    const useCase = new CleanupPreviewUseCase(
      sourceLinkRepository,
      routeRepository,
      deployments,
      deploymentReadModel,
      executionBackend,
      new PassThroughMutationCoordinator(),
      undefined,
      undefined,
      undefined,
      undefined,
      deleteScheduledTask,
    );
    const result = await useCase.execute(context, {
      sourceFingerprint: previewSourceFingerprint,
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      deletedScheduledTasks: 0,
      removedSourceLink: true,
    });
    expect(deleteScheduledTask.calls).toEqual([]);
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
    await deployments.insertOne(
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
      new PassThroughMutationCoordinator(),
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
    await deployments.insertOne(
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
      new PassThroughMutationCoordinator(),
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

  test("[DEPLOYMENTS-CLEANUP-PREVIEW-007] preserves artifact-cleanup failure stage from runtime cleanup", async () => {
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
      err({
        code: "runtime_target_resource_exhausted",
        category: "retryable",
        message: "Preview artifact cleanup could not inspect target",
        retryable: true,
        details: {
          phase: "runtime-cleanup",
          cleanupStage: "artifact-cleanup",
        },
      }),
    );
    const deployments = new MemoryDeploymentRepository();
    const deploymentReadModel = new MemoryDeploymentReadModel();
    const context = createExecutionContext({
      entrypoint: "cli",
      requestId: "req_preview_cleanup_artifact_failure",
    });
    const deployment = createSucceededDeployment();
    await deployments.insertOne(
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
      new PassThroughMutationCoordinator(),
    );
    const result = await useCase.execute(context, {
      sourceFingerprint: previewSourceFingerprint,
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "runtime_target_resource_exhausted",
      details: {
        phase: "preview-cleanup",
        cleanupStage: "artifact-cleanup",
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
    await deployments.insertOne(
      toRepositoryContext(context),
      currentDeployment,
      UpsertDeploymentSpec.fromDeployment(currentDeployment),
    );
    await deployments.insertOne(
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
      new PassThroughMutationCoordinator(),
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

  test("[DEPLOYMENTS-CLEANUP-PREVIEW-007] skips the latest live deployment when closing an older preview", async () => {
    const sourceLinkRepository = new MemorySourceLinkRepository({
      sourceFingerprint: previewSourceFingerprint,
      projectId: "prj_preview_1",
      environmentId: "env_preview_1",
      resourceId: "res_preview_1",
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
        createdAt: "2026-04-20T23:00:00.000Z",
        generatedAt: "2026-04-20T23:00:00.000Z",
        metadata: {
          "access.sourceFingerprint": previewSourceFingerprint,
          "preview.id": "pr-14",
          "preview.mode": "pull-request",
        },
      }),
    ]);
    const context = createExecutionContext({
      entrypoint: "cli",
      requestId: "req_preview_cleanup_preserve_live",
    });
    const liveDeployment = createSucceededDeployment({
      deploymentId: "dep_live_current",
      planId: "plan_live_current",
      generatedAt: "2026-04-21T00:10:00.000Z",
      domain: "www.example.com",
      metadata: {
        "access.routeSource": "server-applied-config-domain",
        "access.sourceFingerprint":
          "source-fingerprint:v1:branch%3Amain:github:repo:.:appaloft.yml",
      },
    });
    const oldPreviewDeployment = createSucceededDeployment({
      deploymentId: "dep_preview_old",
      planId: "plan_preview_old",
      createdAt: "2026-04-20T23:00:00.000Z",
      generatedAt: "2026-04-20T23:00:00.000Z",
      metadata: {
        "access.sourceFingerprint": previewSourceFingerprint,
        "preview.id": "pr-14",
        "preview.mode": "pull-request",
      },
    });
    await deployments.insertOne(
      toRepositoryContext(context),
      oldPreviewDeployment,
      UpsertDeploymentSpec.fromDeployment(oldPreviewDeployment),
    );
    await deployments.insertOne(
      toRepositoryContext(context),
      liveDeployment,
      UpsertDeploymentSpec.fromDeployment(liveDeployment),
    );

    const useCase = new CleanupPreviewUseCase(
      sourceLinkRepository,
      routeRepository,
      deployments,
      deploymentReadModel,
      executionBackend,
      new PassThroughMutationCoordinator(),
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
      deploymentId: "dep_preview_old",
    });
    expect(executionBackend.canceledDeploymentIds).toEqual(["dep_preview_old"]);
    expect(sourceLinkRepository.deletedFingerprints).toEqual([previewSourceFingerprint]);
  });
});
