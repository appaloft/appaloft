import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionContext, toRepositoryContext } from "@appaloft/application";
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
  ResourceStorageAttachmentId,
  ResourceStorageMountModeValue,
  StorageDestinationPath,
  StorageVolume,
  StorageVolumeByIdSpec,
  StorageVolumeId,
  StorageVolumeKindValue,
  StorageVolumeName,
  UpsertEnvironmentSpec,
  UpsertProjectSpec,
  UpsertResourceSpec,
  UpsertStorageVolumeSpec,
} from "@appaloft/core";

describe("storage volume persistence", () => {
  test("[STOR-PERSIST-001] persists storage volumes and resource attachment summaries", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-storage-volume-"));
    const {
      createDatabase,
      createMigrator,
      PgResourceRepository,
      PgEnvironmentRepository,
      PgProjectRepository,
      PgStorageVolumeReadModel,
      PgStorageVolumeRepository,
    } = await import("../src");
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: dataDir,
    });

    try {
      const migrationResult = await createMigrator(database.db).migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      const context = toRepositoryContext(
        createExecutionContext({
          requestId: "req_storage_volume_pglite_test",
          entrypoint: "system",
        }),
      );
      const storageVolumes = new PgStorageVolumeRepository(database.db);
      const storageReadModel = new PgStorageVolumeReadModel(database.db);
      const resources = new PgResourceRepository(database.db);
      const projects = new PgProjectRepository(database.db);
      const environments = new PgEnvironmentRepository(database.db);
      const createdAt = CreatedAt.rehydrate("2026-01-01T00:00:00.000Z");
      const project = Project.create({
        id: ProjectId.rehydrate("prj_demo"),
        name: ProjectName.rehydrate("Demo"),
        createdAt,
      })._unsafeUnwrap();
      const environment = Environment.create({
        id: EnvironmentId.rehydrate("env_demo"),
        projectId: ProjectId.rehydrate("prj_demo"),
        name: EnvironmentName.rehydrate("Production"),
        kind: EnvironmentKindValue.rehydrate("production"),
        createdAt,
      })._unsafeUnwrap();
      const storageVolume = StorageVolume.create({
        id: StorageVolumeId.rehydrate("stv_demo"),
        projectId: ProjectId.rehydrate("prj_demo"),
        environmentId: EnvironmentId.rehydrate("env_demo"),
        name: StorageVolumeName.rehydrate("App Data"),
        kind: StorageVolumeKindValue.rehydrate("named-volume"),
        createdAt,
      })._unsafeUnwrap();
      const resource = Resource.create({
        id: ResourceId.rehydrate("res_web"),
        projectId: ProjectId.rehydrate("prj_demo"),
        environmentId: EnvironmentId.rehydrate("env_demo"),
        name: ResourceName.rehydrate("Web"),
        kind: ResourceKindValue.rehydrate("application"),
        createdAt,
      })._unsafeUnwrap();

      await projects.upsert(context, project, UpsertProjectSpec.fromProject(project));
      await environments.upsert(
        context,
        environment,
        UpsertEnvironmentSpec.fromEnvironment(environment),
      );
      await storageVolumes.upsert(
        context,
        storageVolume,
        UpsertStorageVolumeSpec.fromStorageVolume(storageVolume),
      );
      resource
        .attachStorage({
          attachmentId: ResourceStorageAttachmentId.rehydrate("rsa_demo"),
          storageVolumeId: StorageVolumeId.rehydrate("stv_demo"),
          destinationPath: StorageDestinationPath.rehydrate("/data"),
          mountMode: ResourceStorageMountModeValue.rehydrate("read-write"),
          attachedAt: createdAt,
        })
        ._unsafeUnwrap();
      await resources.upsert(context, resource, UpsertResourceSpec.fromResource(resource));

      const persistedResource = await resources.findOne(
        context,
        ResourceByIdSpec.create(ResourceId.rehydrate("res_web")),
      );
      const summary = await storageReadModel.findOne(
        context,
        StorageVolumeByIdSpec.create(StorageVolumeId.rehydrate("stv_demo")),
      );

      expect(persistedResource?.toState().storageAttachments[0]?.destinationPath.value).toBe(
        "/data",
      );
      expect(summary).toMatchObject({
        id: "stv_demo",
        attachmentCount: 1,
        attachments: [
          {
            attachmentId: "rsa_demo",
            resourceId: "res_web",
            resourceName: "Web",
            resourceSlug: "web",
            destinationPath: "/data",
            mountMode: "read-write",
          },
        ],
      });
      await expect(storageReadModel.countAttachments(context, "stv_demo")).resolves.toBe(1);
    } finally {
      await database.close();
      rmSync(dataDir, { force: true, recursive: true });
    }
  });
});
