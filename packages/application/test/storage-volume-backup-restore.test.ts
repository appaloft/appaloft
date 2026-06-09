import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  DeploymentTarget,
  DeploymentTargetId,
  DeploymentTargetName,
  domainError,
  Environment,
  EnvironmentId,
  EnvironmentKindValue,
  EnvironmentName,
  err,
  HostAddress,
  PortNumber,
  Project,
  ProjectId,
  ProjectName,
  ProviderKey,
  StorageVolume,
  StorageVolumeByIdSpec,
  StorageVolumeId,
  StorageVolumeKindValue,
  StorageVolumeName,
  UpsertEnvironmentSpec,
  UpsertProjectSpec,
  UpsertStorageVolumeSpec,
} from "@appaloft/core";
import {
  CapturedEventBus,
  FakeDependencyResourceBackupProvider,
  FakeStorageBackupProviderRegistry,
  FakeStorageBackupSourceAdapter,
  FakeStorageBackupTargetProvider,
  FixedClock,
  MemoryEnvironmentRepository,
  MemoryProjectRepository,
  MemoryStorageVolumeBackupReadModel,
  MemoryStorageVolumeBackupRepository,
  MemoryStorageVolumeRepository,
  NoopLogger,
  SequenceIdGenerator,
} from "@appaloft/testkit";

import { createExecutionContext, type ExecutionContext, toRepositoryContext } from "../src";
import {
  CreateStorageVolumeBackupPlanQuery,
  CreateStorageVolumeRestorePlanQuery,
  ListStorageVolumeBackupsQuery,
  ShowStorageVolumeBackupQuery,
} from "../src/messages";
import {
  type DeploymentReadModel,
  type DeploymentSummary,
  type ServerRepository,
} from "../src/ports";
import {
  CreateStorageVolumeBackupPlanQueryService,
  CreateStorageVolumeBackupUseCase,
  CreateStorageVolumeRestorePlanQueryService,
  ListStorageVolumeBackupsQueryService,
  PruneStorageVolumeBackupUseCase,
  RestoreStorageVolumeBackupUseCase,
  ShowStorageVolumeBackupQueryService,
} from "../src/use-cases";

function createContext(): ExecutionContext {
  return createExecutionContext({
    requestId: "req_storage_volume_backup_restore_test",
    entrypoint: "system",
  });
}

class EmptyDeploymentReadModel implements DeploymentReadModel {
  async count(): Promise<number> {
    return 0;
  }

  async list(): Promise<DeploymentSummary[]> {
    return [];
  }

  async findOne(): Promise<DeploymentSummary | null> {
    return null;
  }

  async findLogs(): Promise<[]> {
    return [];
  }
}

class EmptyServerRepository implements ServerRepository {
  async findOne(): Promise<null> {
    return null;
  }

  async upsert(): Promise<void> {}
}

class LatestDeploymentReadModel extends EmptyDeploymentReadModel {
  async list(): Promise<DeploymentSummary[]> {
    return [
      {
        resourceId: "res_pocketbase",
        serverId: "srv_demo",
      } as DeploymentSummary,
    ];
  }
}

class SingleServerRepository implements ServerRepository {
  readonly server = DeploymentTarget.register({
    id: DeploymentTargetId.rehydrate("srv_demo"),
    name: DeploymentTargetName.rehydrate("PocketBase host"),
    host: HostAddress.rehydrate("127.0.0.1"),
    port: PortNumber.rehydrate(22),
    providerKey: ProviderKey.rehydrate("generic-ssh"),
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  })._unsafeUnwrap();

  async findOne(): Promise<DeploymentTarget | null> {
    return this.server;
  }

  async upsert(): Promise<void> {}
}

async function createHarness() {
  const context = createContext();
  const repositoryContext = toRepositoryContext(context);
  const clock = new FixedClock("2026-01-01T00:00:00.000Z");
  const projects = new MemoryProjectRepository();
  const environments = new MemoryEnvironmentRepository();
  const storageVolumes = new MemoryStorageVolumeRepository();
  const storageBackups = new MemoryStorageVolumeBackupRepository();
  const storageBackupReadModel = new MemoryStorageVolumeBackupReadModel(storageBackups);
  const eventBus = new CapturedEventBus();
  const logger = new NoopLogger();
  const idGenerator = new SequenceIdGenerator();
  const deploymentReadModel = new EmptyDeploymentReadModel();
  const serverRepository = new EmptyServerRepository();
  const sourceAdapter = new FakeStorageBackupSourceAdapter("tar-volume");
  const sqliteAdapter = new FakeStorageBackupSourceAdapter(
    "sqlite-online-backup",
    (input) =>
      input.source.dataFormat === "sqlite" &&
      input.requestedConsistency === "application-consistent",
  );
  const targetProvider = new FakeStorageBackupTargetProvider("local-filesystem");
  const providerRegistry = new FakeStorageBackupProviderRegistry(
    [sourceAdapter, sqliteAdapter],
    [targetProvider],
  );
  const dependencyBackupProvider = new FakeDependencyResourceBackupProvider();

  const project = Project.create({
    id: ProjectId.rehydrate("prj_demo"),
    name: ProjectName.rehydrate("Demo"),
    createdAt: CreatedAt.rehydrate(clock.now()),
  })._unsafeUnwrap();
  const environment = Environment.create({
    id: EnvironmentId.rehydrate("env_demo"),
    projectId: ProjectId.rehydrate("prj_demo"),
    name: EnvironmentName.rehydrate("Production"),
    kind: EnvironmentKindValue.rehydrate("production"),
    createdAt: CreatedAt.rehydrate(clock.now()),
  })._unsafeUnwrap();
  const storageVolume = StorageVolume.create({
    id: StorageVolumeId.rehydrate("stv_data"),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    name: StorageVolumeName.rehydrate("PocketBase Data"),
    kind: StorageVolumeKindValue.rehydrate("named-volume"),
    createdAt: CreatedAt.rehydrate(clock.now()),
  })._unsafeUnwrap();

  await projects.upsert(repositoryContext, project, UpsertProjectSpec.fromProject(project));
  await environments.upsert(
    repositoryContext,
    environment,
    UpsertEnvironmentSpec.fromEnvironment(environment),
  );
  await storageVolumes.upsert(
    repositoryContext,
    storageVolume,
    UpsertStorageVolumeSpec.fromStorageVolume(storageVolume),
  );

  return {
    clock,
    context,
    createBackup: new CreateStorageVolumeBackupUseCase(
      storageVolumes,
      storageBackups,
      providerRegistry,
      deploymentReadModel,
      serverRepository,
      clock,
      idGenerator,
      eventBus,
      logger,
    ),
    createPlan: new CreateStorageVolumeBackupPlanQueryService(providerRegistry),
    createRestorePlan: new CreateStorageVolumeRestorePlanQueryService(storageBackupReadModel),
    dependencyBackupProvider,
    eventBus,
    listBackups: new ListStorageVolumeBackupsQueryService(storageBackupReadModel, clock),
    pruneBackup: new PruneStorageVolumeBackupUseCase(
      storageBackups,
      providerRegistry,
      clock,
      eventBus,
      logger,
    ),
    repositoryContext,
    restoreBackup: new RestoreStorageVolumeBackupUseCase(
      storageVolumes,
      storageBackups,
      providerRegistry,
      deploymentReadModel,
      serverRepository,
      clock,
      idGenerator,
      eventBus,
      logger,
    ),
    showBackup: new ShowStorageVolumeBackupQueryService(storageBackupReadModel, clock),
    sourceAdapter,
    storageBackups,
    storageVolumes,
    targetProvider,
  };
}

function backupPlanRequest() {
  return {
    source: {
      storageVolumeId: "stv_data",
      resourceId: "res_pocketbase",
      attachmentId: "rsa_data",
      destinationPath: "/pb_data",
      dataFormat: "filesystem" as const,
      liveWrites: false,
    },
    requestedConsistency: "quiesced" as const,
    target: {
      providerKey: "local-filesystem" as const,
      targetRef: "local://backups/pocketbase",
    },
    retention: {
      maxCount: 3,
      minFreeBytes: 1024,
    },
  };
}

describe("storage volume backup and restore application flow", () => {
  test("[STOR-BACKUP-PLAN-001] previews provider/source plan without exposing target secrets", async () => {
    const { context, createPlan } = await createHarness();

    const result = await createPlan.execute(
      context,
      CreateStorageVolumeBackupPlanQuery.create({
        storageVolumeId: "stv_data",
        ...backupPlanRequest(),
        target: {
          providerKey: "local-filesystem",
          targetRef: "local://backups/pocketbase",
          secretRef: "secret://backup-targets/local",
        },
      })._unsafeUnwrap(),
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      schemaVersion: "storage-volumes.backup-plan/v1",
      storageVolumeId: "stv_data",
      sourceAdapterKey: "tar-volume",
      targetProviderKey: "local-filesystem",
      blockers: [],
    });
    expect(JSON.stringify(result._unsafeUnwrap())).not.toContain("secret://backup-targets");
  });

  test("[STOR-BACKUP-CREATE-001] creates backup through storage source and target providers only", async () => {
    const {
      context,
      createBackup,
      dependencyBackupProvider,
      listBackups,
      sourceAdapter,
      targetProvider,
    } = await createHarness();

    const result = await createBackup.execute(context, {
      storageVolumeId: "stv_data",
      planRequest: backupPlanRequest(),
    });

    expect(result.isOk()).toBe(true);
    expect(sourceAdapter.created).toHaveLength(1);
    expect(targetProvider.stored).toHaveLength(1);
    expect(dependencyBackupProvider.backups).toHaveLength(0);
    const listed = await listBackups.execute(
      context,
      ListStorageVolumeBackupsQuery.create({ storageVolumeId: "stv_data" })._unsafeUnwrap(),
    );
    expect(listed._unsafeUnwrap().items).toEqual([
      expect.objectContaining({
        id: result._unsafeUnwrap().id,
        storageVolumeId: "stv_data",
        status: "ready",
        artifactHandle: "artifact://storage-volume-backup/test",
        retentionStatus: "retained",
      }),
    ]);
  });

  test("[STOR-BACKUP-CREATE-002] defaults runtime target to the latest deployment server", async () => {
    const harness = await createHarness();
    const createBackup = new CreateStorageVolumeBackupUseCase(
      harness.storageVolumes,
      harness.storageBackups,
      new FakeStorageBackupProviderRegistry([harness.sourceAdapter], [harness.targetProvider]),
      new LatestDeploymentReadModel(),
      new SingleServerRepository(),
      harness.clock,
      new SequenceIdGenerator(),
      harness.eventBus,
      new NoopLogger(),
    );

    const result = await createBackup.execute(harness.context, {
      storageVolumeId: "stv_data",
      planRequest: {
        ...backupPlanRequest(),
        source: {
          storageVolumeId: "stv_data",
          resourceId: "res_pocketbase",
          attachmentId: "rsa_data",
          destinationPath: "/pb_data",
          dataFormat: "filesystem" as const,
          liveWrites: false,
        },
      },
    });

    expect(result.isOk()).toBe(true);
    expect(harness.sourceAdapter.created[0]?.runtimeTarget?.id.value).toBe("srv_demo");
    expect(harness.targetProvider.stored[0]?.runtimeTarget?.id.value).toBe("srv_demo");
  });

  test("[STOR-BACKUP-SQLITE-001] blocks live SQLite copy when app-consistent adapter is unavailable", async () => {
    const clock = new FixedClock("2026-01-01T00:00:00.000Z");
    const context = createContext();
    const providerRegistry = new FakeStorageBackupProviderRegistry(
      [new FakeStorageBackupSourceAdapter("tar-volume", () => false)],
      [new FakeStorageBackupTargetProvider("local-filesystem")],
    );
    const service = new CreateStorageVolumeBackupPlanQueryService(providerRegistry);

    void clock;
    const result = await service.execute(
      context,
      CreateStorageVolumeBackupPlanQuery.create({
        storageVolumeId: "stv_data",
        ...backupPlanRequest(),
        source: {
          ...backupPlanRequest().source,
          dataFormat: "sqlite",
          liveWrites: true,
        },
        requestedConsistency: "application-consistent",
      })._unsafeUnwrap(),
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().blockers).toEqual([
      expect.objectContaining({ code: "unsafe-live-sqlite-copy" }),
    ]);
  });

  test("[STOR-BACKUP-RESTORE-001] restore defaults to a new storage volume", async () => {
    const {
      context,
      createBackup,
      createRestorePlan,
      repositoryContext,
      restoreBackup,
      showBackup,
      storageVolumes,
      targetProvider,
    } = await createHarness();
    const backupId = (
      await createBackup.execute(context, {
        storageVolumeId: "stv_data",
        planRequest: backupPlanRequest(),
      })
    )._unsafeUnwrap().id;

    const plan = await createRestorePlan.execute(
      context,
      CreateStorageVolumeRestorePlanQuery.create({
        backupId,
        targetMode: "new-volume",
      })._unsafeUnwrap(),
    );
    expect(plan._unsafeUnwrap()).toMatchObject({
      backupId,
      sourceStorageVolumeId: "stv_data",
      targetMode: "new-volume",
      destructive: false,
      blockers: [],
    });

    const restored = await restoreBackup.execute(context, {
      backupId,
      targetMode: "new-volume",
      restoredVolumeName: "PocketBase Restored Data",
    });

    expect(restored.isOk()).toBe(true);
    expect(targetProvider.restored).toHaveLength(1);
    const restoredVolumeId = restored._unsafeUnwrap().restoredStorageVolumeId;
    expect(restoredVolumeId).toBeDefined();
    const restoredVolume = await storageVolumes.findOne(
      repositoryContext,
      StorageVolumeByIdSpec.create(StorageVolumeId.rehydrate(restoredVolumeId ?? "")),
    );
    expect(restoredVolume?.toState().name.value).toBe("PocketBase Restored Data");
    const shown = await showBackup.execute(
      context,
      ShowStorageVolumeBackupQuery.create({ backupId })._unsafeUnwrap(),
    );
    expect(shown._unsafeUnwrap().backup.latestRestoreAttempt).toMatchObject({
      status: "completed",
      target: {
        storageVolumeId: restoredVolumeId,
        restoredVolumeId,
        destructiveInPlace: false,
      },
    });
  });

  test("[STOR-BACKUP-INPLACE-001] restore plan and execution block in-place destructive restore", async () => {
    const { context, createBackup, createRestorePlan, restoreBackup } = await createHarness();
    const backupId = (
      await createBackup.execute(context, {
        storageVolumeId: "stv_data",
        planRequest: backupPlanRequest(),
      })
    )._unsafeUnwrap().id;

    const plan = await createRestorePlan.execute(
      context,
      CreateStorageVolumeRestorePlanQuery.create({
        backupId,
        targetMode: "in-place",
      })._unsafeUnwrap(),
    );
    expect(plan._unsafeUnwrap().blockers).toEqual([
      expect.objectContaining({ code: "destructive-acknowledgement-required" }),
    ]);

    const restored = await restoreBackup.execute(context, {
      backupId,
      targetMode: "in-place",
      acknowledgeDestructiveRestore: true,
    });
    expect(restored.isErr()).toBe(true);
    expect(restored._unsafeUnwrapErr()).toMatchObject({
      code: "conflict",
      details: {
        phase: "storage-volume-restore-admission",
      },
    });
  });

  test("[STOR-BACKUP-RETENTION-001] prune marks artifact pruned through target provider", async () => {
    const { context, createBackup, pruneBackup, showBackup, targetProvider } =
      await createHarness();
    const backupId = (
      await createBackup.execute(context, {
        storageVolumeId: "stv_data",
        planRequest: backupPlanRequest(),
      })
    )._unsafeUnwrap().id;

    const pruned = await pruneBackup.execute(context, { backupId });

    expect(pruned.isOk()).toBe(true);
    expect(targetProvider.pruned).toHaveLength(1);
    const shown = await showBackup.execute(
      context,
      ShowStorageVolumeBackupQuery.create({ backupId })._unsafeUnwrap(),
    );
    expect(shown._unsafeUnwrap().backup).toMatchObject({
      id: backupId,
      status: "pruned",
      retentionStatus: "pruned",
    });
  });

  test("[STOR-BACKUP-CREATE-001] failed source adapter persists failed backup readback", async () => {
    const context = createContext();
    const repositoryContext = toRepositoryContext(context);
    const clock = new FixedClock("2026-01-01T00:00:00.000Z");
    const storageVolumes = new MemoryStorageVolumeRepository();
    const storageBackups = new MemoryStorageVolumeBackupRepository();
    const storageBackupReadModel = new MemoryStorageVolumeBackupReadModel(storageBackups);
    const failingSource = new FakeStorageBackupSourceAdapter(
      "tar-volume",
      () => true,
      err(domainError.providerCapabilityUnsupported("source failed", { phase: "test" })),
    );
    const providerRegistry = new FakeStorageBackupProviderRegistry(
      [failingSource],
      [new FakeStorageBackupTargetProvider("local-filesystem")],
    );
    const storageVolume = StorageVolume.create({
      id: StorageVolumeId.rehydrate("stv_data"),
      projectId: ProjectId.rehydrate("prj_demo"),
      environmentId: EnvironmentId.rehydrate("env_demo"),
      name: StorageVolumeName.rehydrate("PocketBase Data"),
      kind: StorageVolumeKindValue.rehydrate("named-volume"),
      createdAt: CreatedAt.rehydrate(clock.now()),
    })._unsafeUnwrap();
    await storageVolumes.upsert(
      repositoryContext,
      storageVolume,
      UpsertStorageVolumeSpec.fromStorageVolume(storageVolume),
    );
    const useCase = new CreateStorageVolumeBackupUseCase(
      storageVolumes,
      storageBackups,
      providerRegistry,
      new EmptyDeploymentReadModel(),
      new EmptyServerRepository(),
      clock,
      new SequenceIdGenerator(),
      new CapturedEventBus(),
      new NoopLogger(),
    );

    const result = await useCase.execute(context, {
      storageVolumeId: "stv_data",
      planRequest: backupPlanRequest(),
    });

    expect(result.isOk()).toBe(true);
    const listed = await new ListStorageVolumeBackupsQueryService(
      storageBackupReadModel,
      clock,
    ).execute(
      context,
      ListStorageVolumeBackupsQuery.create({ storageVolumeId: "stv_data" })._unsafeUnwrap(),
    );
    expect(listed._unsafeUnwrap().items[0]).toMatchObject({
      status: "failed",
      failureCode: "provider_capability_unsupported",
      failureMessage: "source failed",
    });
  });
});
