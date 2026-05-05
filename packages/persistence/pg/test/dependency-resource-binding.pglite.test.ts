import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionContext, toRepositoryContext } from "@appaloft/application";
import {
  CreatedAt,
  DependencyResourceSourceModeValue,
  Environment,
  EnvironmentId,
  EnvironmentKindValue,
  EnvironmentName,
  Project,
  ProjectId,
  ProjectName,
  ProviderKey,
  ResourceBinding,
  ResourceBindingId,
  ResourceBindingScopeValue,
  ResourceBindingSecretRef,
  ResourceBindingSecretVersion,
  ResourceBindingTargetName,
  ResourceId,
  ResourceInjectionModeValue,
  ResourceInstance,
  ResourceInstanceId,
  ResourceInstanceKindValue,
  ResourceInstanceName,
  UpdatedAt,
  UpsertEnvironmentSpec,
  UpsertProjectSpec,
  UpsertResourceBindingSpec,
  UpsertResourceInstanceSpec,
} from "@appaloft/core";

describe("dependency resource binding persistence", () => {
  test("[DEP-BIND-PG-READ-001] [DEP-BIND-PG-DELETE-001] persists binding read model and delete blocker", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-dependency-binding-"));
    const {
      createDatabase,
      createMigrator,
      PgDependencyResourceDeleteSafetyReader,
      PgDependencyResourceRepository,
      PgDependencyBindingSecretStore,
      PgEnvironmentRepository,
      PgProjectRepository,
      PgResourceDependencyBindingReadModel,
      PgResourceDependencyBindingRepository,
    } = await import("../src");
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: dataDir,
    });

    try {
      const migrationResult = await createMigrator(database.db).migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      const executionContext = createExecutionContext({
        requestId: "req_dependency_binding_pglite_test",
        entrypoint: "system",
      });
      const context = toRepositoryContext(executionContext);
      const dependencyResources = new PgDependencyResourceRepository(database.db);
      const bindings = new PgResourceDependencyBindingRepository(database.db);
      const readModel = new PgResourceDependencyBindingReadModel(database.db);
      const deleteSafetyReader = new PgDependencyResourceDeleteSafetyReader(database.db);
      const secretStore = new PgDependencyBindingSecretStore(database.db);
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
      const dependencyResource = ResourceInstance.createPostgresDependencyResource({
        id: ResourceInstanceId.rehydrate("rsi_pg"),
        projectId: ProjectId.rehydrate("prj_demo"),
        environmentId: EnvironmentId.rehydrate("env_demo"),
        name: ResourceInstanceName.rehydrate("External DB"),
        kind: ResourceInstanceKindValue.rehydrate("postgres"),
        sourceMode: DependencyResourceSourceModeValue.rehydrate("imported-external"),
        providerKey: ProviderKey.rehydrate("external-postgres"),
        endpoint: {
          host: "db.example.com",
          port: 5432,
          databaseName: "app",
          maskedConnection: "postgres://app:********@db.example.com:5432/app",
        },
        providerManaged: false,
        createdAt,
      })._unsafeUnwrap();
      const binding = ResourceBinding.create({
        id: ResourceBindingId.rehydrate("rbd_pg"),
        projectId: ProjectId.rehydrate("prj_demo"),
        environmentId: EnvironmentId.rehydrate("env_demo"),
        resourceId: ResourceId.rehydrate("res_web"),
        resourceInstanceId: ResourceInstanceId.rehydrate("rsi_pg"),
        targetName: ResourceBindingTargetName.rehydrate("DATABASE_URL"),
        scope: ResourceBindingScopeValue.rehydrate("runtime-only"),
        injectionMode: ResourceInjectionModeValue.rehydrate("env"),
        createdAt,
      })._unsafeUnwrap();

      await projects.upsert(context, project, UpsertProjectSpec.fromProject(project));
      await environments.upsert(
        context,
        environment,
        UpsertEnvironmentSpec.fromEnvironment(environment),
      );
      await dependencyResources.upsert(
        context,
        dependencyResource,
        UpsertResourceInstanceSpec.fromResourceInstance(dependencyResource),
      );
      await bindings.upsert(
        context,
        binding,
        UpsertResourceBindingSpec.fromResourceBinding(binding),
      );
      const storedSecret = (
        await secretStore.store(executionContext, {
          bindingId: "rbd_pg",
          resourceId: "res_web",
          secretValue: "postgres://app:super-secret@db.example.com:5432/app",
          secretVersion: "rbsv_0001",
          rotatedAt: "2026-01-01T00:02:00.000Z",
        })
      )._unsafeUnwrap();
      binding
        .rotateSecret({
          secretRef: ResourceBindingSecretRef.rehydrate(storedSecret.secretRef),
          secretVersion: ResourceBindingSecretVersion.rehydrate(storedSecret.secretVersion),
          rotatedAt: UpdatedAt.rehydrate("2026-01-01T00:02:00.000Z"),
        })
        ._unsafeUnwrap();
      await bindings.upsert(
        context,
        binding,
        UpsertResourceBindingSpec.fromResourceBinding(binding),
      );

      const list = await readModel.list(context, { resourceId: "res_web" });
      const blockers = await deleteSafetyReader.findBlockers(context, {
        dependencyResourceId: "rsi_pg",
      });

      expect(list._unsafeUnwrap()[0]).toMatchObject({
        id: "rbd_pg",
        dependencyResourceId: "rsi_pg",
        target: {
          targetName: "DATABASE_URL",
          secretRef: "appaloft+pg://resource-binding/rbd_pg/rbsv_0001",
        },
        connection: {
          maskedConnection: "postgres://app:********@db.example.com:5432/app",
        },
        secretRotation: {
          secretRef: "appaloft+pg://resource-binding/rbd_pg/rbsv_0001",
          secretVersion: "rbsv_0001",
          rotatedAt: "2026-01-01T00:02:00.000Z",
        },
      });
      expect(blockers._unsafeUnwrap()).toEqual([{ kind: "resource-binding", count: 1 }]);
      expect(JSON.stringify(list._unsafeUnwrap())).not.toContain("super-secret");
    } finally {
      await database.close();
      rmSync(dataDir, { force: true, recursive: true });
    }
  });
});
