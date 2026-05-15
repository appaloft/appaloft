import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  CreatedAt,
  domainError,
  Environment,
  EnvironmentId,
  EnvironmentKindValue,
  EnvironmentName,
  err,
  ok,
  Project,
  ProjectId,
  ProjectName,
  type Result,
  UpsertEnvironmentSpec,
  UpsertProjectSpec,
} from "@appaloft/core";
import {
  CapturedEventBus,
  FakeDependencyResourceBackupProvider,
  FakeDependencyResourceSecretStore,
  FakeManagedPostgresProvider,
  FakeManagedRedisProvider,
  FixedClock,
  MemoryDependencyResourceBackupReadModel,
  MemoryDependencyResourceBackupRepository,
  MemoryDependencyResourceDeleteSafetyReader,
  MemoryDependencyResourceRepository,
  MemoryEnvironmentRepository,
  MemoryProjectRepository,
  MemoryServerRepository,
  NoopLogger,
  SequenceIdGenerator,
} from "@appaloft/testkit";

import {
  createExecutionContext,
  type ExecutionContext,
  type ProcessAttemptClaimer,
  type ProcessAttemptClaimInput,
  type ProcessAttemptClaimResult,
  type ProcessAttemptCompleter,
  type ProcessAttemptCompletionInput,
  type ProcessAttemptCompletionResult,
  type ProcessAttemptRecord,
  type ProcessAttemptRecorder,
  type RepositoryContext,
  toRepositoryContext,
} from "../src";
import {
  CreateDependencyResourceBackupCommand,
  RestoreDependencyResourceBackupCommand,
  ShowDependencyResourceBackupQuery,
} from "../src/messages";
import {
  CreateDependencyResourceBackupUseCase,
  DeleteDependencyResourceUseCase,
  ListDependencyResourceBackupsQueryService,
  ProvisionPostgresDependencyResourceUseCase,
  ProvisionRedisDependencyResourceUseCase,
  RestoreDependencyResourceBackupUseCase,
  ShowDependencyResourceBackupQueryService,
} from "../src/use-cases";

function createContext(): ExecutionContext {
  return createExecutionContext({
    requestId: "req_dependency_resource_backup_restore_test",
    entrypoint: "system",
  });
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

class RecordingProcessAttemptClaimer implements ProcessAttemptClaimer {
  readonly inputs: ProcessAttemptClaimInput[] = [];

  constructor(private readonly recorder: RecordingProcessAttemptRecorder) {}

  async claimDue(
    _context: RepositoryContext,
    input: ProcessAttemptClaimInput,
  ): Promise<Result<ProcessAttemptClaimResult>> {
    this.inputs.push(input);
    const attempt = this.recorder.records.find((record) => record.id === input.attemptId);
    if (!attempt) {
      return ok({ status: "not-found", attemptId: input.attemptId });
    }
    return ok({
      status: "claimed",
      attempt: {
        ...attempt,
        status: "running",
        phase: "worker-claim",
        step: "claimed",
        updatedAt: input.claimedAt,
        safeDetails: {
          ...(attempt.safeDetails ?? {}),
          ...(input.safeDetails ?? {}),
          claimedAt: input.claimedAt,
          claimedBy: input.workerId,
        },
      },
    });
  }
}

class RecordingProcessAttemptCompleter implements ProcessAttemptCompleter {
  readonly inputs: ProcessAttemptCompletionInput[] = [];

  async complete(
    _context: RepositoryContext,
    input: ProcessAttemptCompletionInput,
  ): Promise<Result<ProcessAttemptCompletionResult>> {
    this.inputs.push(input);
    return ok({
      status: "completed",
      attempt: {
        id: input.attemptId,
        kind: "system",
        status: input.status,
        operationKey: "dependency-resource-provider-test",
        updatedAt: input.completedAt,
        finishedAt: input.completedAt,
        nextActions: input.nextActions,
        ...(input.phase ? { phase: input.phase } : {}),
        ...(input.step ? { step: input.step } : {}),
        ...(input.errorCode ? { errorCode: input.errorCode } : {}),
        ...(input.errorCategory ? { errorCategory: input.errorCategory } : {}),
        ...(input.retriable !== undefined ? { retriable: input.retriable } : {}),
        ...(input.safeDetails ? { safeDetails: input.safeDetails } : {}),
      },
    });
  }
}

async function createHarness() {
  const context = createContext();
  const repositoryContext = toRepositoryContext(context);
  const clock = new FixedClock("2026-01-01T00:00:00.000Z");
  const projects = new MemoryProjectRepository();
  const environments = new MemoryEnvironmentRepository();
  const dependencyResources = new MemoryDependencyResourceRepository();
  const backups = new MemoryDependencyResourceBackupRepository();
  const backupReadModel = new MemoryDependencyResourceBackupReadModel(backups);
  const dependencyResourceSecretStore = new FakeDependencyResourceSecretStore();
  const servers = new MemoryServerRepository();
  const deleteSafetyReader = new MemoryDependencyResourceDeleteSafetyReader(undefined, backups);
  const eventBus = new CapturedEventBus();
  const managedPostgresProvider = new FakeManagedPostgresProvider();
  const managedRedisProvider = new FakeManagedRedisProvider();
  const backupProvider = new FakeDependencyResourceBackupProvider();
  const logger = new NoopLogger();
  const idGenerator = new SequenceIdGenerator();
  const processAttemptRecorder = new RecordingProcessAttemptRecorder();

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

  await projects.upsert(repositoryContext, project, UpsertProjectSpec.fromProject(project));
  await environments.upsert(
    repositoryContext,
    environment,
    UpsertEnvironmentSpec.fromEnvironment(environment),
  );

  return {
    backupProvider,
    backups,
    context,
    createBackupWithProcessAttemptDelivery: (
      processAttemptClaimer: ProcessAttemptClaimer,
      processAttemptCompleter: ProcessAttemptCompleter,
    ) =>
      new CreateDependencyResourceBackupUseCase(
        dependencyResources,
        backups,
        backupProvider,
        dependencyResourceSecretStore,
        clock,
        idGenerator,
        eventBus,
        logger,
        processAttemptRecorder,
        processAttemptClaimer,
        processAttemptCompleter,
      ),
    createBackup: new CreateDependencyResourceBackupUseCase(
      dependencyResources,
      backups,
      backupProvider,
      dependencyResourceSecretStore,
      clock,
      idGenerator,
      eventBus,
      logger,
      processAttemptRecorder,
    ),
    deleteDependencyResource: new DeleteDependencyResourceUseCase(
      dependencyResources,
      deleteSafetyReader,
      clock,
      idGenerator,
      eventBus,
      logger,
      managedPostgresProvider,
      managedRedisProvider,
    ),
    dependencyResources,
    eventBus,
    listBackups: new ListDependencyResourceBackupsQueryService(backupReadModel, clock),
    provisionPostgres: new ProvisionPostgresDependencyResourceUseCase(
      projects,
      environments,
      servers,
      dependencyResources,
      dependencyResourceSecretStore,
      clock,
      idGenerator,
      eventBus,
      logger,
      managedPostgresProvider,
    ),
    provisionRedis: new ProvisionRedisDependencyResourceUseCase(
      projects,
      environments,
      servers,
      dependencyResources,
      dependencyResourceSecretStore,
      clock,
      idGenerator,
      eventBus,
      logger,
      managedRedisProvider,
      processAttemptRecorder,
    ),
    repositoryContext,
    processAttemptRecorder,
    restoreBackup: new RestoreDependencyResourceBackupUseCase(
      dependencyResources,
      backups,
      backupProvider,
      dependencyResourceSecretStore,
      clock,
      idGenerator,
      eventBus,
      logger,
      processAttemptRecorder,
    ),
    restoreBackupWithProcessAttemptDelivery: (
      processAttemptClaimer: ProcessAttemptClaimer,
      processAttemptCompleter: ProcessAttemptCompleter,
    ) =>
      new RestoreDependencyResourceBackupUseCase(
        dependencyResources,
        backups,
        backupProvider,
        dependencyResourceSecretStore,
        clock,
        idGenerator,
        eventBus,
        logger,
        processAttemptRecorder,
        processAttemptClaimer,
        processAttemptCompleter,
      ),
    showBackup: new ShowDependencyResourceBackupQueryService(backupReadModel, clock),
  };
}

describe("dependency resource backup and restore use cases", () => {
  test("[DEP-RES-BACKUP-001] [DEP-RES-BACKUP-002] [PROC-DELIVERY-001] creates a ready provider backup", async () => {
    const {
      backupProvider,
      context,
      createBackup,
      eventBus,
      processAttemptRecorder,
      provisionPostgres,
      showBackup,
    } = await createHarness();
    const dependencyResourceId = (
      await provisionPostgres.execute(context, {
        projectId: "prj_demo",
        environmentId: "env_demo",
        name: "Main DB",
      })
    )._unsafeUnwrap().id;

    const result = await createBackup.execute(
      context,
      CreateDependencyResourceBackupCommand.create({ dependencyResourceId })._unsafeUnwrap(),
    );

    expect(result.isOk()).toBe(true);
    expect(backupProvider.backups).toContainEqual(
      expect.objectContaining({
        connection: {
          databaseName: "main_db",
          host: "main-db.postgres.internal",
          maskedConnection: `postgres://app:********@main-db.postgres.internal:5432/main_db`,
          port: 5432,
          secretRef: `secret://dependency/postgres/${dependencyResourceId}`,
        },
        dependencyResourceId,
        providerKey: "appaloft-managed-postgres",
        providerResourceHandle: `pg/${dependencyResourceId}`,
      }),
    );
    expect(eventBus.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "dependency-resource-backup-requested" }),
        expect.objectContaining({ type: "dependency-resource-backup-completed" }),
      ]),
    );
    const shown = await showBackup.execute(
      context,
      ShowDependencyResourceBackupQuery.create({
        backupId: result._unsafeUnwrap().id,
      })._unsafeUnwrap(),
    );
    expect(shown._unsafeUnwrap().backup).toMatchObject({
      id: result._unsafeUnwrap().id,
      dependencyResourceId,
      status: "ready",
      retentionStatus: "retained",
      providerArtifactHandle: `backup/${dependencyResourceId}/${result._unsafeUnwrap().id}`,
    });
    expect(processAttemptRecorder.records).toEqual([
      {
        id: "dba_0004",
        kind: "system",
        status: "running",
        operationKey: "dependency-resources.create-backup",
        dedupeKey: `dependency-resource-backup:${dependencyResourceId}:drb_0003:dba_0004`,
        correlationId: "req_dependency_resource_backup_restore_test",
        requestId: "req_dependency_resource_backup_restore_test",
        phase: "dependency-resource-backup",
        step: "pending",
        projectId: "prj_demo",
        startedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        nextActions: ["no-action"],
        safeDetails: {
          backupId: "drb_0003",
          dependencyResourceId,
          dependencyKind: "postgres",
          providerKey: "appaloft-managed-postgres",
          retentionStatus: "none",
        },
      },
      {
        id: "dba_0004",
        kind: "system",
        status: "succeeded",
        operationKey: "dependency-resources.create-backup",
        dedupeKey: `dependency-resource-backup:${dependencyResourceId}:drb_0003:dba_0004`,
        correlationId: "req_dependency_resource_backup_restore_test",
        requestId: "req_dependency_resource_backup_restore_test",
        phase: "dependency-resource-backup",
        step: "ready",
        projectId: "prj_demo",
        startedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        finishedAt: "2026-01-01T00:00:00.000Z",
        nextActions: ["no-action"],
        safeDetails: {
          backupId: "drb_0003",
          dependencyResourceId,
          dependencyKind: "postgres",
          providerKey: "appaloft-managed-postgres",
          retentionStatus: "retained",
        },
      },
    ]);
  });

  test("[DEP-RES-BACKUP-003] [PROC-DELIVERY-004] records provider backup failure as failed metadata", async () => {
    const {
      backupProvider,
      context,
      createBackup,
      processAttemptRecorder,
      provisionPostgres,
      showBackup,
    } = await createHarness();
    backupProvider.setBackupResult(
      err(
        domainError.provider("Backup failed with secret token output", {
          phase: "dependency-resource-backup",
          providerKey: "appaloft-managed-postgres",
        }),
      ),
    );
    const dependencyResourceId = (
      await provisionPostgres.execute(context, {
        projectId: "prj_demo",
        environmentId: "env_demo",
        name: "Main DB",
      })
    )._unsafeUnwrap().id;

    const result = await createBackup.execute(context, { dependencyResourceId });
    const shown = await showBackup.execute(
      context,
      ShowDependencyResourceBackupQuery.create({
        backupId: result._unsafeUnwrap().id,
      })._unsafeUnwrap(),
    );

    expect(result.isOk()).toBe(true);
    expect(shown._unsafeUnwrap().backup).toMatchObject({
      status: "failed",
      failureCode: "provider_error",
    });
    expect(processAttemptRecorder.records.at(-1)).toMatchObject({
      id: "dba_0004",
      kind: "system",
      status: "failed",
      operationKey: "dependency-resources.create-backup",
      phase: "dependency-resource-backup",
      step: "failed",
      projectId: "prj_demo",
      errorCode: "provider_error",
      errorCategory: "async-processing",
      retriable: true,
      nextActions: ["diagnostic", "manual-review"],
      safeDetails: {
        backupId: "drb_0003",
        dependencyResourceId,
        dependencyKind: "postgres",
        providerKey: "appaloft-managed-postgres",
      },
    });
    expect(JSON.stringify(processAttemptRecorder.records)).not.toContain("secret token output");
  });

  test("[DEP-RES-BACKUP-001] [DEP-RES-BACKUP-006] [PROC-DELIVERY-002] claims and completes provider backup and restore attempts when a process journal is available", async () => {
    const {
      context,
      createBackupWithProcessAttemptDelivery,
      processAttemptRecorder,
      provisionPostgres,
      restoreBackupWithProcessAttemptDelivery,
    } = await createHarness();
    const processAttemptClaimer = new RecordingProcessAttemptClaimer(processAttemptRecorder);
    const processAttemptCompleter = new RecordingProcessAttemptCompleter();
    const createBackup = createBackupWithProcessAttemptDelivery(
      processAttemptClaimer,
      processAttemptCompleter,
    );
    const restoreBackup = restoreBackupWithProcessAttemptDelivery(
      processAttemptClaimer,
      processAttemptCompleter,
    );
    const dependencyResourceId = (
      await provisionPostgres.execute(context, {
        projectId: "prj_demo",
        environmentId: "env_demo",
        name: "Main DB",
      })
    )._unsafeUnwrap().id;

    const backupId = (await createBackup.execute(context, { dependencyResourceId }))._unsafeUnwrap()
      .id;
    const restore = await restoreBackup.execute(context, {
      backupId,
      acknowledgeDataOverwrite: true,
      acknowledgeRuntimeNotRestarted: true,
    });

    expect(restore.isOk()).toBe(true);
    expect(processAttemptRecorder.records.map((record) => record.status)).toEqual([
      "pending",
      "pending",
    ]);
    expect(processAttemptClaimer.inputs).toEqual([
      expect.objectContaining({
        attemptId: "dba_0004",
        workerId: "dependency-resource-backup-inline-provider",
        safeDetails: expect.objectContaining({
          backupId,
          dependencyResourceId,
          dependencyKind: "postgres",
        }),
      }),
      expect.objectContaining({
        attemptId: "dra_0005",
        workerId: "dependency-resource-restore-inline-provider",
        safeDetails: expect.objectContaining({
          backupId,
          dependencyResourceId,
          dependencyKind: "postgres",
          restoreAttemptId: "dra_0005",
        }),
      }),
    ]);
    expect(processAttemptCompleter.inputs).toEqual([
      expect.objectContaining({
        attemptId: "dba_0004",
        status: "succeeded",
        phase: "dependency-resource-backup",
        step: "ready",
        nextActions: ["no-action"],
      }),
      expect.objectContaining({
        attemptId: "dra_0005",
        status: "succeeded",
        phase: "dependency-resource-restore",
        step: "completed",
        nextActions: ["no-action"],
      }),
    ]);
  });

  test("[DEP-RES-REDIS-CLOSED-LOOP-001] managed Redis backup and restore uses provider context", async () => {
    const { backupProvider, context, createBackup, provisionRedis, restoreBackup } =
      await createHarness();
    const dependencyResourceId = (
      await provisionRedis.execute(context, {
        projectId: "prj_demo",
        environmentId: "env_demo",
        name: "Main Cache",
      })
    )._unsafeUnwrap().id;

    const backupId = (await createBackup.execute(context, { dependencyResourceId }))._unsafeUnwrap()
      .id;
    const restore = await restoreBackup.execute(context, {
      backupId,
      acknowledgeDataOverwrite: true,
      acknowledgeRuntimeNotRestarted: true,
    });

    expect(restore.isOk()).toBe(true);
    expect(backupProvider.backups).toContainEqual(
      expect.objectContaining({
        connection: {
          host: "main-cache.redis.internal",
          maskedConnection: "redis://:********@main-cache.redis.internal:6379/0",
          port: 6379,
          secretRef: `secret://dependency/redis/${dependencyResourceId}`,
        },
        dependencyKind: "redis",
        dependencyResourceId,
        providerKey: "appaloft-managed-redis",
        providerResourceHandle: `redis/${dependencyResourceId}`,
      }),
    );
    expect(backupProvider.restores).toContainEqual(
      expect.objectContaining({
        backupId,
        dependencyKind: "redis",
        dependencyResourceId,
        providerArtifactHandle: `backup/${dependencyResourceId}/${backupId}`,
        providerKey: "appaloft-managed-redis",
        providerResourceHandle: `redis/${dependencyResourceId}`,
      }),
    );
  });

  test("[DEP-RES-BACKUP-004] rejects unsupported backup provider before persistence", async () => {
    const { backupProvider, backups, context, createBackup, provisionPostgres } =
      await createHarness();
    backupProvider.setSupported([]);
    const dependencyResourceId = (
      await provisionPostgres.execute(context, {
        projectId: "prj_demo",
        environmentId: "env_demo",
        name: "Main DB",
      })
    )._unsafeUnwrap().id;

    const result = await createBackup.execute(context, { dependencyResourceId });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "provider_capability_unsupported",
      details: {
        operation: "dependency-resources.create-backup",
        phase: "dependency-resource-backup-admission",
      },
    });
    expect(backups.items.size).toBe(0);
  });

  test("[DEP-RES-BACKUP-006] [DEP-RES-BACKUP-007] [PROC-DELIVERY-001] restores a ready backup with acknowledgements", async () => {
    const {
      backupProvider,
      context,
      createBackup,
      processAttemptRecorder,
      provisionPostgres,
      restoreBackup,
      showBackup,
    } = await createHarness();
    const dependencyResourceId = (
      await provisionPostgres.execute(context, {
        projectId: "prj_demo",
        environmentId: "env_demo",
        name: "Main DB",
      })
    )._unsafeUnwrap().id;
    const backupId = (await createBackup.execute(context, { dependencyResourceId }))._unsafeUnwrap()
      .id;

    const result = await restoreBackup.execute(
      context,
      RestoreDependencyResourceBackupCommand.create({
        backupId,
        acknowledgeDataOverwrite: true,
        acknowledgeRuntimeNotRestarted: true,
      })._unsafeUnwrap(),
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().id).toMatch(/^dra_/);
    expect(backupProvider.restores).toContainEqual(
      expect.objectContaining({
        backupId,
        connection: {
          databaseName: "main_db",
          host: "main-db.postgres.internal",
          maskedConnection: `postgres://app:********@main-db.postgres.internal:5432/main_db`,
          port: 5432,
          secretRef: `secret://dependency/postgres/${dependencyResourceId}`,
        },
        dependencyResourceId,
        providerArtifactHandle: `backup/${dependencyResourceId}/${backupId}`,
        providerResourceHandle: `pg/${dependencyResourceId}`,
      }),
    );
    const shown = await showBackup.execute(
      context,
      ShowDependencyResourceBackupQuery.create({ backupId })._unsafeUnwrap(),
    );
    expect(shown._unsafeUnwrap().backup.latestRestoreAttempt).toMatchObject({
      attemptId: result._unsafeUnwrap().id,
      status: "completed",
    });
    expect(processAttemptRecorder.records.slice(-2)).toEqual([
      {
        id: "dra_0005",
        kind: "system",
        status: "running",
        operationKey: "dependency-resources.restore-backup",
        dedupeKey: `dependency-resource-restore:${dependencyResourceId}:drb_0003:dra_0005`,
        correlationId: "req_dependency_resource_backup_restore_test",
        requestId: "req_dependency_resource_backup_restore_test",
        phase: "dependency-resource-restore",
        step: "pending",
        projectId: "prj_demo",
        startedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        nextActions: ["no-action"],
        safeDetails: {
          backupId: "drb_0003",
          dependencyResourceId,
          dependencyKind: "postgres",
          providerKey: "appaloft-managed-postgres",
          restoreAttemptId: "dra_0005",
        },
      },
      {
        id: "dra_0005",
        kind: "system",
        status: "succeeded",
        operationKey: "dependency-resources.restore-backup",
        dedupeKey: `dependency-resource-restore:${dependencyResourceId}:drb_0003:dra_0005`,
        correlationId: "req_dependency_resource_backup_restore_test",
        requestId: "req_dependency_resource_backup_restore_test",
        phase: "dependency-resource-restore",
        step: "completed",
        projectId: "prj_demo",
        startedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        finishedAt: "2026-01-01T00:00:00.000Z",
        nextActions: ["no-action"],
        safeDetails: {
          backupId: "drb_0003",
          dependencyResourceId,
          dependencyKind: "postgres",
          providerKey: "appaloft-managed-postgres",
          restoreAttemptId: "dra_0005",
        },
      },
    ]);
  });

  test("[DEP-RES-BACKUP-008] [PROC-DELIVERY-004] records provider restore failure safely", async () => {
    const {
      backupProvider,
      context,
      createBackup,
      processAttemptRecorder,
      provisionPostgres,
      restoreBackup,
      showBackup,
    } = await createHarness();
    const dependencyResourceId = (
      await provisionPostgres.execute(context, {
        projectId: "prj_demo",
        environmentId: "env_demo",
        name: "Main DB",
      })
    )._unsafeUnwrap().id;
    const backupId = (await createBackup.execute(context, { dependencyResourceId }))._unsafeUnwrap()
      .id;
    backupProvider.setRestoreResult(
      err(
        domainError.provider("Restore failed with secret token output", {
          phase: "dependency-resource-restore",
          providerKey: "appaloft-managed-postgres",
        }),
      ),
    );

    const result = await restoreBackup.execute(
      context,
      RestoreDependencyResourceBackupCommand.create({
        backupId,
        acknowledgeDataOverwrite: true,
        acknowledgeRuntimeNotRestarted: true,
      })._unsafeUnwrap(),
    );

    expect(result.isOk()).toBe(true);
    const shown = await showBackup.execute(
      context,
      ShowDependencyResourceBackupQuery.create({ backupId })._unsafeUnwrap(),
    );
    expect(shown._unsafeUnwrap().backup.latestRestoreAttempt).toMatchObject({
      attemptId: result._unsafeUnwrap().id,
      status: "failed",
      failureCode: "provider_error",
    });
    expect(processAttemptRecorder.records.at(-1)).toMatchObject({
      id: "dra_0005",
      kind: "system",
      status: "failed",
      operationKey: "dependency-resources.restore-backup",
      phase: "dependency-resource-restore",
      step: "failed",
      projectId: "prj_demo",
      errorCode: "provider_error",
      errorCategory: "async-processing",
      retriable: true,
      nextActions: ["diagnostic", "manual-review"],
      safeDetails: {
        backupId: "drb_0003",
        dependencyResourceId,
        dependencyKind: "postgres",
        providerKey: "appaloft-managed-postgres",
        restoreAttemptId: "dra_0005",
      },
    });
    expect(JSON.stringify(processAttemptRecorder.records)).not.toContain("secret token output");
  });

  test("[DEP-RES-BACKUP-009] requires explicit restore acknowledgements", () => {
    const invalidInput = {
      backupId: "drb_1",
      acknowledgeDataOverwrite: true,
      acknowledgeRuntimeNotRestarted: false,
    } as unknown as Parameters<typeof RestoreDependencyResourceBackupCommand.create>[0];

    const parsed = RestoreDependencyResourceBackupCommand.create(invalidInput);

    expect(parsed.isErr()).toBe(true);
    expect(parsed._unsafeUnwrapErr()).toMatchObject({
      code: "validation_error",
    });
  });

  test("[DEP-RES-BACKUP-010] retained backups block dependency resource deletion", async () => {
    const { context, createBackup, deleteDependencyResource, provisionPostgres } =
      await createHarness();
    const dependencyResourceId = (
      await provisionPostgres.execute(context, {
        projectId: "prj_demo",
        environmentId: "env_demo",
        name: "Main DB",
      })
    )._unsafeUnwrap().id;
    await createBackup.execute(context, { dependencyResourceId });

    const deleted = await deleteDependencyResource.execute(context, {
      dependencyResourceId,
    });

    expect(deleted.isErr()).toBe(true);
    expect(deleted._unsafeUnwrapErr()).toMatchObject({
      code: "dependency_resource_delete_blocked",
      details: {
        deletionBlockers: expect.stringContaining("dependency-resource-backup"),
      },
    });
  });
});

describe("dependency resource backup and restore source-of-truth sync", () => {
  test("[DEP-RES-BACKUP-001] [PROC-DELIVERY-002] business map records journal-backed claim/completion", () => {
    const businessOperationMap = readFileSync("docs/BUSINESS_OPERATION_MAP.md", "utf8");
    const durableProcessSpec = readFileSync(
      "docs/specs/060-durable-process-delivery-baseline/spec.md",
      "utf8",
    );
    const durableProcessMatrix = readFileSync(
      "docs/testing/durable-process-delivery-test-matrix.md",
      "utf8",
    );
    const coreOperations = readFileSync("docs/CORE_OPERATIONS.md", "utf8");
    const normalizedBusinessOperationMap = businessOperationMap.replace(/\s+/g, " ");
    const normalizedDurableProcessSpec = durableProcessSpec.replace(/\s+/g, " ");
    const normalizedDurableProcessMatrix = durableProcessMatrix.replace(/\s+/g, " ");
    const normalizedCoreOperations = coreOperations.replace(/\s+/g, " ");

    expect(normalizedBusinessOperationMap).toContain(
      "dependency resource backup/restore are implemented process-attempt claim/completion bindings",
    );
    expect(normalizedBusinessOperationMap).toContain("when a journal is available");
    expect(normalizedBusinessOperationMap).not.toContain(
      "source-event auto-deploy, dependency resource backup/restore, provider-native dependency resource realization/delete",
    );
    expect(normalizedDurableProcessSpec).toContain(
      "dependency resource backup/restore process-attempt claim/completion binding",
    );
    expect(normalizedDurableProcessSpec).toContain("when a journal is available");
    expect(normalizedDurableProcessMatrix).toContain(
      "Dependency resource backup/restore coverage in `packages/application/test/dependency-resource-backup-restore.test.ts` proves provider backup and restore attempts use pending records, process-attempt claim, and process-attempt completion when journal ports are available.",
    );
    expect(normalizedDurableProcessMatrix).not.toContain(
      "dependency-resources.create-backup` and `dependency-resources.restore-backup` record running and succeeded provider attempts",
    );
    expect(normalizedCoreOperations).toContain(
      "scheduled-task runs, scheduled runtime prune, scheduled history retention, and runtime monitoring collection are selected durable worker bindings",
    );
    expect(normalizedCoreOperations).toContain(
      "Dependency resource backup/restore consumes process-attempt claim/completion when journal ports are available",
    );
    expect(normalizedCoreOperations).not.toContain(
      "scheduled-task runs, scheduled runtime prune, and scheduled history retention are selected worker bindings",
    );
  });
});
