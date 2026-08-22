import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CLI_PACKED_SOURCE_ARCHIVE_METADATA_KEY,
  CLI_RESOLVED_SOURCE_METADATA_KEY,
  createExecutionContext,
  toRepositoryContext,
} from "@appaloft/application";
import {
  CreatedAt,
  DisplayNameText,
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
  SourceKindValue,
  SourceLocator,
  SourceOriginalLocator,
  UpsertEnvironmentSpec,
  UpsertProjectSpec,
  UpsertResourceSpec,
} from "@appaloft/core";

describe("hyphenated local-folder source persistence", () => {
  test("[DEP-CREATE-PKG-007] PGlite source_binding keeps the leaf locator and CLI archive", async () => {
    const parent = "/Users/nichenqin/projects";
    const folder = `${parent}/nux-ae9c38f3-static`;
    const packedSourceArchive = "H4sIAAAAAAAAAytKLSpILC4u1gMA";
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-hyphenated-local-source-"));
    const {
      createDatabase,
      createMigrator,
      PgEnvironmentRepository,
      PgProjectRepository,
      PgResourceRepository,
    } = await import("../src");
    const database = await createDatabase({ driver: "pglite", pgliteDataDir: dataDir });

    try {
      const migrationResult = await createMigrator(database.db).migrateToLatest();
      expect(migrationResult.error).toBeUndefined();
      const context = toRepositoryContext(
        createExecutionContext({
          requestId: "req_hyphenated_local_source_pglite_test",
          entrypoint: "system",
        }),
      );
      const projects = new PgProjectRepository(database.db);
      const environments = new PgEnvironmentRepository(database.db);
      const resources = new PgResourceRepository(database.db);
      const createdAt = CreatedAt.rehydrate("2026-08-21T00:00:00.000Z");
      const project = Project.create({
        id: ProjectId.rehydrate("prj_leaf"),
        name: ProjectName.rehydrate("Leaf"),
        createdAt,
      })._unsafeUnwrap();
      const environment = Environment.create({
        id: EnvironmentId.rehydrate("env_leaf"),
        projectId: ProjectId.rehydrate("prj_leaf"),
        name: EnvironmentName.rehydrate("Production"),
        kind: EnvironmentKindValue.rehydrate("production"),
        createdAt,
      })._unsafeUnwrap();
      const resource = Resource.create({
        id: ResourceId.rehydrate("res_leaf"),
        projectId: ProjectId.rehydrate("prj_leaf"),
        environmentId: EnvironmentId.rehydrate("env_leaf"),
        name: ResourceName.rehydrate("nux-ae9c38f3-static"),
        kind: ResourceKindValue.rehydrate("static-site"),
        sourceBinding: {
          kind: SourceKindValue.rehydrate("local-folder"),
          locator: SourceLocator.rehydrate(folder),
          displayName: DisplayNameText.rehydrate("nux-ae9c38f3-static"),
          originalLocator: SourceOriginalLocator.rehydrate(folder),
          metadata: {
            [CLI_RESOLVED_SOURCE_METADATA_KEY]: folder,
            [CLI_PACKED_SOURCE_ARCHIVE_METADATA_KEY]: packedSourceArchive,
          },
        },
        createdAt,
      })._unsafeUnwrap();

      await projects.upsert(context, project, UpsertProjectSpec.fromProject(project));
      await environments.upsert(
        context,
        environment,
        UpsertEnvironmentSpec.fromEnvironment(environment),
      );
      await resources.upsert(context, resource, UpsertResourceSpec.fromResource(resource));
      const persisted = await resources.findOne(
        context,
        ResourceByIdSpec.create(ResourceId.rehydrate("res_leaf")),
      );
      const source = persisted?.toState().sourceBinding;
      const descriptor = persisted?.createDeploymentSourceDescriptor()._unsafeUnwrap();

      expect(source?.locator.value).toBe(folder);
      expect(source?.originalLocator?.value).toBe(folder);
      expect(source?.metadata?.[CLI_RESOLVED_SOURCE_METADATA_KEY]).toBe(folder);
      expect(source?.metadata?.[CLI_PACKED_SOURCE_ARCHIVE_METADATA_KEY]).toBe(packedSourceArchive);
      expect(source?.locator.value).not.toBe(parent);
      expect(source?.originalLocator?.value).not.toBe(parent);
      expect(descriptor?.source.locator.value).toBe(folder);
      expect(descriptor?.source.metadata?.[CLI_PACKED_SOURCE_ARCHIVE_METADATA_KEY]).toBe(
        packedSourceArchive,
      );
      expect(descriptor?.source.metadata?.originalLocator).toBe(folder);
    } finally {
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 20_000);
});
