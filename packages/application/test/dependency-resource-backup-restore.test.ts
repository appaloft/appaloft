import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  domainError,
  Environment,
  EnvironmentId,
  EnvironmentKindValue,
  EnvironmentName,
  err,
  Project,
  ProjectId,
  ProjectName,
  UpsertEnvironmentSpec,
  UpsertProjectSpec,
} from "@appaloft/core";
import {
  CapturedEventBus,
  FakeDependencyResourceBackupProvider,
  FakeManagedPostgresProvider,
  FixedClock,
  MemoryDependencyResourceBackupReadModel,
  MemoryDependencyResourceBackupRepository,
  MemoryDependencyResourceDeleteSafetyReader,
  MemoryDependencyResourceRepository,
  MemoryEnvironmentRepository,
  MemoryProjectRepository,
  NoopLogger,
  SequenceIdGenerator,
} from "@appaloft/testkit";

import { createExecutionContext, type ExecutionContext, toRepositoryContext } from "../src";
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
  RestoreDependencyResourceBackupUseCase,
  ShowDependencyResourceBackupQueryService,
} from "../src/use-cases";

function createContext(): ExecutionContext {
  return createExecutionContext({
    requestId: "req_dependency_resource_backup_restore_test",
    entrypoint: "system",
  });
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
  const deleteSafetyReader = new MemoryDependencyResourceDeleteSafetyReader(undefined, backups);
  const eventBus = new CapturedEventBus();
  const managedPostgresProvider = new FakeManagedPostgresProvider();
  const backupProvider = new FakeDependencyResourceBackupProvider();
  const logger = new NoopLogger();
  const idGenerator = new SequenceIdGenerator();

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
    createBackup: new CreateDependencyResourceBackupUseCase(
      dependencyResources,
      backups,
      backupProvider,
      clock,
      idGenerator,
      eventBus,
      logger,
    ),
    deleteDependencyResource: new DeleteDependencyResourceUseCase(
      dependencyResources,
      deleteSafetyReader,
      clock,
      idGenerator,
      eventBus,
      logger,
      managedPostgresProvider,
    ),
    dependencyResources,
    eventBus,
    listBackups: new ListDependencyResourceBackupsQueryService(backupReadModel, clock),
    provisionPostgres: new ProvisionPostgresDependencyResourceUseCase(
      projects,
      environments,
      dependencyResources,
      clock,
      idGenerator,
      eventBus,
      logger,
      managedPostgresProvider,
    ),
    repositoryContext,
    restoreBackup: new RestoreDependencyResourceBackupUseCase(
      dependencyResources,
      backups,
      backupProvider,
      clock,
      idGenerator,
      eventBus,
      logger,
    ),
    showBackup: new ShowDependencyResourceBackupQueryService(backupReadModel, clock),
  };
}

describe("dependency resource backup and restore use cases", () => {
  test("[DEP-RES-BACKUP-001] [DEP-RES-BACKUP-002] creates a ready provider backup", async () => {
    const { backupProvider, context, createBackup, eventBus, provisionPostgres, showBackup } =
      await createHarness();
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
        dependencyResourceId,
        providerKey: "appaloft-managed-postgres",
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
  });

  test("[DEP-RES-BACKUP-003] records provider backup failure as failed metadata", async () => {
    const { backupProvider, context, createBackup, provisionPostgres, showBackup } =
      await createHarness();
    backupProvider.setBackupResult(
      err(
        domainError.provider("Backup failed", {
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

  test("[DEP-RES-BACKUP-006] [DEP-RES-BACKUP-007] restores a ready backup with acknowledgements", async () => {
    const { backupProvider, context, createBackup, provisionPostgres, restoreBackup, showBackup } =
      await createHarness();
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
        dependencyResourceId,
        providerArtifactHandle: `backup/${dependencyResourceId}/${backupId}`,
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
