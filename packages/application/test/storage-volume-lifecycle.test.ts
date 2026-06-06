import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  ArchivedAt,
  CreatedAt,
  Environment,
  EnvironmentId,
  EnvironmentKindValue,
  EnvironmentName,
  Project,
  ProjectId,
  ProjectName,
  Resource,
  ResourceByIdSpec,
  ResourceId,
  ResourceKindValue,
  ResourceName,
  StorageVolumeByIdSpec,
  StorageVolumeId,
  UpsertEnvironmentSpec,
  UpsertProjectSpec,
  UpsertResourceSpec,
} from "@appaloft/core";
import {
  CapturedEventBus,
  FixedClock,
  MemoryEnvironmentRepository,
  MemoryProjectRepository,
  MemoryResourceRepository,
  MemoryStorageVolumeReadModel,
  MemoryStorageVolumeRepository,
  NoopLogger,
  SequenceIdGenerator,
} from "@appaloft/testkit";

import {
  createExecutionContext,
  type ExecutionContext,
  type OperationCheckRequest,
  type OperationGuardDecision,
  type OperationGuardPort,
  toRepositoryContext,
} from "../src";
import { ListStorageVolumesQuery, ShowStorageVolumeQuery } from "../src/messages";
import {
  AttachResourceStorageUseCase,
  CreateStorageVolumeUseCase,
  DeleteStorageVolumeUseCase,
  DetachResourceStorageUseCase,
  ListStorageVolumesQueryService,
  RenameStorageVolumeUseCase,
  ShowStorageVolumeQueryService,
} from "../src/use-cases";

class DenyingOperationGuardPort implements OperationGuardPort {
  readonly requests: OperationCheckRequest[] = [];

  async checkOperation(
    _context: ExecutionContext,
    request: OperationCheckRequest,
  ): Promise<OperationGuardDecision> {
    this.requests.push(request);
    return {
      allowed: false,
      checks: [
        {
          allowed: false,
          checkKey: "test.quota",
          kind: "quota",
          reason: "test-operation-denied",
        },
      ],
      deniedBy: {
        checkKey: "test.quota",
        kind: "quota",
      },
      reason: "test-operation-denied",
    };
  }
}

function createContext(): ExecutionContext {
  return createExecutionContext({
    requestId: "req_storage_volume_lifecycle_test",
    entrypoint: "system",
  });
}

async function createHarness(input?: { guard?: OperationGuardPort }) {
  const context = createContext();
  const repositoryContext = toRepositoryContext(context);
  const clock = new FixedClock("2026-01-01T00:00:00.000Z");
  const projects = new MemoryProjectRepository();
  const environments = new MemoryEnvironmentRepository();
  const resources = new MemoryResourceRepository();
  const storageVolumes = new MemoryStorageVolumeRepository();
  const storageReadModel = new MemoryStorageVolumeReadModel(storageVolumes, resources);
  const eventBus = new CapturedEventBus();
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
  const resource = Resource.create({
    id: ResourceId.rehydrate("res_web"),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    name: ResourceName.rehydrate("Web"),
    kind: ResourceKindValue.rehydrate("application"),
    createdAt: CreatedAt.rehydrate(clock.now()),
  })._unsafeUnwrap();

  await projects.upsert(repositoryContext, project, UpsertProjectSpec.fromProject(project));
  await environments.upsert(
    repositoryContext,
    environment,
    UpsertEnvironmentSpec.fromEnvironment(environment),
  );
  await resources.upsert(repositoryContext, resource, UpsertResourceSpec.fromResource(resource));

  return {
    attachStorage: new AttachResourceStorageUseCase(
      resources,
      storageVolumes,
      clock,
      idGenerator,
      eventBus,
      logger,
    ),
    context,
    createStorage: new CreateStorageVolumeUseCase(
      projects,
      environments,
      storageVolumes,
      clock,
      idGenerator,
      eventBus,
      logger,
      input?.guard,
      storageReadModel,
    ),
    deleteStorage: new DeleteStorageVolumeUseCase(
      storageVolumes,
      storageReadModel,
      clock,
      eventBus,
      logger,
    ),
    detachStorage: new DetachResourceStorageUseCase(resources, clock, eventBus, logger),
    eventBus,
    listStorage: new ListStorageVolumesQueryService(storageReadModel, clock),
    renameStorage: new RenameStorageVolumeUseCase(storageVolumes, clock, eventBus, logger),
    repositoryContext,
    resources,
    showStorage: new ShowStorageVolumeQueryService(storageReadModel, clock),
    storageReadModel,
    storageVolumes,
  };
}

describe("Storage volume lifecycle use cases", () => {
  test("[STOR-CREATE-001] creates a named volume and publishes storage-volume-created", async () => {
    const { context, createStorage, eventBus, repositoryContext, storageVolumes } =
      await createHarness();

    const result = await createStorage.execute(context, {
      projectId: "prj_demo",
      environmentId: "env_demo",
      name: "App Data",
      kind: "named-volume",
    });

    expect(result.isOk()).toBe(true);
    const storageVolume = await storageVolumes.findOne(
      repositoryContext,
      StorageVolumeByIdSpec.create(StorageVolumeId.rehydrate(result._unsafeUnwrap().id)),
    );
    expect(storageVolume?.toState()).toMatchObject({
      name: expect.objectContaining({ value: "App Data" }),
      slug: expect.objectContaining({ value: "app-data" }),
    });
    expect(eventBus.events).toContainEqual(
      expect.objectContaining({
        type: "storage-volume-created",
        aggregateId: result._unsafeUnwrap().id,
      }),
    );
  });

  test("[STOR-CREATE-002] rejects unsafe bind mount source paths", async () => {
    const { context, createStorage } = await createHarness();

    const result = await createStorage.execute(context, {
      projectId: "prj_demo",
      environmentId: "env_demo",
      name: "Unsafe",
      kind: "bind-mount",
      sourcePath: "/var/lib/../secret",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "validation_error",
      details: {
        phase: "storage-volume-validation",
        field: "sourcePath",
      },
    });
  });

  test("[STOR-CREATE-GUARD-001] create volume can be denied by the generic operation guard", async () => {
    const guard = new DenyingOperationGuardPort();
    const { context, createStorage, eventBus, repositoryContext, storageVolumes } =
      await createHarness({ guard });

    const result = await createStorage.execute(context, {
      projectId: "prj_demo",
      environmentId: "env_demo",
      name: "App Data",
      kind: "named-volume",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "operation_check_denied",
      details: {
        checkKey: "test.quota",
        checkKind: "quota",
        operationKey: "storage-volumes.create",
        projectId: "prj_demo",
        environmentId: "env_demo",
        reason: "test-operation-denied",
      },
    });
    expect(guard.requests).toHaveLength(1);
    expect(guard.requests[0]).toMatchObject({
      operationKey: "storage-volumes.create",
      contextAttributes: {
        currentEnvironmentStorageVolumeCount: 0,
        currentProjectStorageVolumeCount: 0,
      },
      resourceRefs: {
        projectId: "prj_demo",
        environmentId: "env_demo",
      },
    });
    expect(
      await storageVolumes.findOne(
        repositoryContext,
        StorageVolumeByIdSpec.create(StorageVolumeId.rehydrate("stv_0001")),
      ),
    ).toBeNull();
    expect(eventBus.events).toHaveLength(0);
  });

  test("[STOR-VOL-RENAME-001] renames active volumes without mutating attachments", async () => {
    const { attachStorage, context, createStorage, eventBus, renameStorage, showStorage } =
      await createHarness();
    const volume = (
      await createStorage.execute(context, {
        projectId: "prj_demo",
        environmentId: "env_demo",
        name: "Data",
        kind: "named-volume",
      })
    )._unsafeUnwrap();
    const attachment = (
      await attachStorage.execute(context, {
        resourceId: "res_web",
        storageVolumeId: volume.id,
        destinationPath: "/data",
        mountMode: "read-write",
      })
    )._unsafeUnwrap();

    const result = await renameStorage.execute(context, {
      storageVolumeId: volume.id,
      name: "Renamed Data",
    });

    expect(result.isOk()).toBe(true);
    const show = await showStorage.execute(
      context,
      ShowStorageVolumeQuery.create({ storageVolumeId: volume.id })._unsafeUnwrap(),
    );
    expect(show._unsafeUnwrap().storageVolume).toMatchObject({
      id: volume.id,
      name: "Renamed Data",
      slug: "renamed-data",
      attachments: [
        expect.objectContaining({
          attachmentId: attachment.id,
          resourceId: "res_web",
          destinationPath: "/data",
        }),
      ],
    });
    expect(eventBus.events).toContainEqual(
      expect.objectContaining({
        type: "storage-volume-renamed",
        aggregateId: volume.id,
      }),
    );
  });

  test("[STOR-ATTACH-002] rejects duplicate resource destination paths", async () => {
    const { attachStorage, context, createStorage } = await createHarness();
    const volumeOne = (
      await createStorage.execute(context, {
        projectId: "prj_demo",
        environmentId: "env_demo",
        name: "Data One",
        kind: "named-volume",
      })
    )._unsafeUnwrap();
    const volumeTwo = (
      await createStorage.execute(context, {
        projectId: "prj_demo",
        environmentId: "env_demo",
        name: "Data Two",
        kind: "named-volume",
      })
    )._unsafeUnwrap();

    await attachStorage
      .execute(context, {
        resourceId: "res_web",
        storageVolumeId: volumeOne.id,
        destinationPath: "/data",
        mountMode: "read-write",
      })
      .then((result) => result._unsafeUnwrap());

    const duplicate = await attachStorage.execute(context, {
      resourceId: "res_web",
      storageVolumeId: volumeTwo.id,
      destinationPath: "/data",
      mountMode: "read-only",
    });

    expect(duplicate.isErr()).toBe(true);
    expect(duplicate._unsafeUnwrapErr()).toMatchObject({
      code: "conflict",
      details: {
        phase: "resource-storage-attachment",
        destinationPath: "/data",
      },
    });
  });

  test("[STOR-ATTACH-003] rejects archived resource attachment", async () => {
    const { attachStorage, context, createStorage, repositoryContext, resources } =
      await createHarness();
    const volume = (
      await createStorage.execute(context, {
        projectId: "prj_demo",
        environmentId: "env_demo",
        name: "Data",
        kind: "named-volume",
      })
    )._unsafeUnwrap();
    const resource = await resources.findOne(
      repositoryContext,
      ResourceByIdSpec.create(ResourceId.rehydrate("res_web")),
    );
    resource
      ?.archive({ archivedAt: ArchivedAt.rehydrate("2026-01-01T00:05:00.000Z") })
      ._unsafeUnwrap();
    if (resource) {
      await resources.upsert(
        repositoryContext,
        resource,
        UpsertResourceSpec.fromResource(resource),
      );
    }

    const result = await attachStorage.execute(context, {
      resourceId: "res_web",
      storageVolumeId: volume.id,
      destinationPath: "/data",
      mountMode: "read-write",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "resource_archived",
    });
  });

  test("[STOR-ATTACH-004] rejects unsafe destination paths before mutation", async () => {
    const { attachStorage, context, createStorage, repositoryContext, resources } =
      await createHarness();
    const volume = (
      await createStorage.execute(context, {
        projectId: "prj_demo",
        environmentId: "env_demo",
        name: "Data",
        kind: "named-volume",
      })
    )._unsafeUnwrap();

    const result = await attachStorage.execute(context, {
      resourceId: "res_web",
      storageVolumeId: volume.id,
      destinationPath: "/var/lib/../secret",
      mountMode: "read-write",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "validation_error",
      details: {
        phase: "resource-storage-attachment",
        field: "destinationPath",
      },
    });
    const resource = await resources.findOne(
      repositoryContext,
      ResourceByIdSpec.create(ResourceId.rehydrate("res_web")),
    );
    expect(resource?.toState().storageAttachments).toHaveLength(0);
  });

  test("[STOR-DETACH-001] detaches storage without deleting the volume", async () => {
    const { attachStorage, context, createStorage, detachStorage, repositoryContext, resources } =
      await createHarness();
    const volume = (
      await createStorage.execute(context, {
        projectId: "prj_demo",
        environmentId: "env_demo",
        name: "Data",
        kind: "named-volume",
      })
    )._unsafeUnwrap();
    const attachment = (
      await attachStorage.execute(context, {
        resourceId: "res_web",
        storageVolumeId: volume.id,
        destinationPath: "/data",
        mountMode: "read-write",
      })
    )._unsafeUnwrap();

    const result = await detachStorage.execute(context, {
      resourceId: "res_web",
      attachmentId: attachment.id,
    });

    expect(result.isOk()).toBe(true);
    const resource = await resources.findOne(
      repositoryContext,
      ResourceByIdSpec.create(ResourceId.rehydrate("res_web")),
    );
    expect(resource?.toState().storageAttachments).toHaveLength(0);
  });

  test("[STOR-DETACH-002] detaches storage from an archived resource during cleanup", async () => {
    const { attachStorage, context, createStorage, detachStorage, repositoryContext, resources } =
      await createHarness();
    const volume = (
      await createStorage.execute(context, {
        projectId: "prj_demo",
        environmentId: "env_demo",
        name: "Data",
        kind: "named-volume",
      })
    )._unsafeUnwrap();
    const attachment = (
      await attachStorage.execute(context, {
        resourceId: "res_web",
        storageVolumeId: volume.id,
        destinationPath: "/data",
        mountMode: "read-write",
      })
    )._unsafeUnwrap();
    const resourceBeforeArchive = await resources.findOne(
      repositoryContext,
      ResourceByIdSpec.create(ResourceId.rehydrate("res_web")),
    );
    resourceBeforeArchive
      ?.archive({
        archivedAt: ArchivedAt.rehydrate("2026-01-01T00:00:05.000Z"),
      })
      ._unsafeUnwrap();
    if (!resourceBeforeArchive) {
      throw new Error("resource fixture was not persisted");
    }
    await resources.upsert(
      repositoryContext,
      resourceBeforeArchive,
      UpsertResourceSpec.fromResource(resourceBeforeArchive),
    );

    const result = await detachStorage.execute(context, {
      resourceId: "res_web",
      attachmentId: attachment.id,
    });

    expect(result.isOk()).toBe(true);
    const resource = await resources.findOne(
      repositoryContext,
      ResourceByIdSpec.create(ResourceId.rehydrate("res_web")),
    );
    expect(resource?.toState().lifecycleStatus.value).toBe("archived");
    expect(resource?.toState().storageAttachments).toHaveLength(0);
  });

  test("[STOR-DELETE-001] blocks attached volume deletion by default", async () => {
    const { attachStorage, context, createStorage, deleteStorage } = await createHarness();
    const volume = (
      await createStorage.execute(context, {
        projectId: "prj_demo",
        environmentId: "env_demo",
        name: "Data",
        kind: "named-volume",
      })
    )._unsafeUnwrap();
    await attachStorage
      .execute(context, {
        resourceId: "res_web",
        storageVolumeId: volume.id,
        destinationPath: "/data",
        mountMode: "read-write",
      })
      .then((result) => result._unsafeUnwrap());

    const result = await deleteStorage.execute(context, { storageVolumeId: volume.id });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "conflict",
      details: {
        phase: "storage-volume-delete-safety",
      },
    });
  });

  test("[STOR-VOL-DELETE-001] deletes unattached volumes from normal reads", async () => {
    const { context, createStorage, deleteStorage, listStorage, showStorage } =
      await createHarness();
    const volume = (
      await createStorage.execute(context, {
        projectId: "prj_demo",
        environmentId: "env_demo",
        name: "Temporary",
        kind: "named-volume",
      })
    )._unsafeUnwrap();

    const result = await deleteStorage.execute(context, { storageVolumeId: volume.id });

    expect(result.isOk()).toBe(true);
    const show = await showStorage.execute(
      context,
      ShowStorageVolumeQuery.create({ storageVolumeId: volume.id })._unsafeUnwrap(),
    );
    const list = await listStorage.execute(
      context,
      ListStorageVolumesQuery.create({ projectId: "prj_demo" })._unsafeUnwrap(),
    );
    expect(show.isErr()).toBe(true);
    expect(show._unsafeUnwrapErr()).toMatchObject({ code: "not_found" });
    expect(list._unsafeUnwrap().items.map((item) => item.id)).not.toContain(volume.id);
  });

  test("[STOR-VOL-DELETE-003] blocks volume deletion while backup retention is required", async () => {
    const { context, createStorage, deleteStorage } = await createHarness();
    const volume = (
      await createStorage.execute(context, {
        projectId: "prj_demo",
        environmentId: "env_demo",
        name: "Retained",
        kind: "named-volume",
        backupRelationship: {
          retentionRequired: true,
          reason: "compliance",
        },
      })
    )._unsafeUnwrap();

    const result = await deleteStorage.execute(context, { storageVolumeId: volume.id });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "conflict",
      details: {
        phase: "storage-volume-delete-safety",
        deletionBlockers: "backup-relationship",
      },
    });
  });

  test("[STOR-READ-001] show and list include safe attachment summaries", async () => {
    const { attachStorage, context, createStorage, listStorage, showStorage } =
      await createHarness();
    const volume = (
      await createStorage.execute(context, {
        projectId: "prj_demo",
        environmentId: "env_demo",
        name: "Data",
        kind: "named-volume",
      })
    )._unsafeUnwrap();
    await attachStorage
      .execute(context, {
        resourceId: "res_web",
        storageVolumeId: volume.id,
        destinationPath: "/data",
        mountMode: "read-write",
      })
      .then((result) => result._unsafeUnwrap());

    const show = await showStorage.execute(
      context,
      ShowStorageVolumeQuery.create({ storageVolumeId: volume.id })._unsafeUnwrap(),
    );
    const list = await listStorage.execute(
      context,
      ListStorageVolumesQuery.create({ projectId: "prj_demo" })._unsafeUnwrap(),
    );

    expect(show._unsafeUnwrap().storageVolume.attachments).toEqual([
      expect.objectContaining({
        resourceId: "res_web",
        resourceName: "Web",
        destinationPath: "/data",
      }),
    ]);
    expect(list._unsafeUnwrap().items[0]?.attachmentCount).toBe(1);
  });
});
