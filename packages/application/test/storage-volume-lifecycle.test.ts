import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
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

import { createExecutionContext, type ExecutionContext, toRepositoryContext } from "../src";
import { ListStorageVolumesQuery, ShowStorageVolumeQuery } from "../src/messages";
import {
  AttachResourceStorageUseCase,
  CreateStorageVolumeUseCase,
  DeleteStorageVolumeUseCase,
  DetachResourceStorageUseCase,
  ListStorageVolumesQueryService,
  ShowStorageVolumeQueryService,
} from "../src/use-cases";

function createContext(): ExecutionContext {
  return createExecutionContext({
    requestId: "req_storage_volume_lifecycle_test",
    entrypoint: "system",
  });
}

async function createHarness() {
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
