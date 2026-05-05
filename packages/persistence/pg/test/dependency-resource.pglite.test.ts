import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionContext, toRepositoryContext } from "@appaloft/application";
import {
  CreatedAt,
  DependencyResourceProviderRealizationAttemptId,
  DependencyResourceProviderRealizationStatusValue,
  DependencyResourceProviderResourceHandle,
  DependencyResourceSecretRef,
  DependencyResourceSourceModeValue,
  Environment,
  EnvironmentId,
  EnvironmentKindValue,
  EnvironmentName,
  OccurredAt,
  Project,
  ProjectId,
  ProjectName,
  ProviderKey,
  ResourceInstance,
  ResourceInstanceByIdSpec,
  ResourceInstanceId,
  ResourceInstanceKindValue,
  ResourceInstanceName,
  UpsertEnvironmentSpec,
  UpsertProjectSpec,
  UpsertResourceInstanceSpec,
} from "@appaloft/core";

describe("dependency resource persistence", () => {
  test("[DEP-RES-PG-READ-001] [DEP-RES-PG-READ-002] persists Postgres resources with masked read model", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-dependency-resource-"));
    const {
      createDatabase,
      createMigrator,
      PgDependencyResourceReadModel,
      PgDependencyResourceRepository,
      PgEnvironmentRepository,
      PgProjectRepository,
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
          requestId: "req_dependency_resource_pglite_test",
          entrypoint: "system",
        }),
      );
      const dependencyResources = new PgDependencyResourceRepository(database.db);
      const readModel = new PgDependencyResourceReadModel(database.db);
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
        backupRelationship: {
          retentionRequired: true,
        },
        providerManaged: false,
        createdAt,
      })._unsafeUnwrap();
      const redisResource = ResourceInstance.createRedisDependencyResource({
        id: ResourceInstanceId.rehydrate("rsi_redis"),
        projectId: ProjectId.rehydrate("prj_demo"),
        environmentId: EnvironmentId.rehydrate("env_demo"),
        name: ResourceInstanceName.rehydrate("External Cache"),
        kind: ResourceInstanceKindValue.rehydrate("redis"),
        sourceMode: DependencyResourceSourceModeValue.rehydrate("imported-external"),
        providerKey: ProviderKey.rehydrate("external-redis"),
        endpoint: {
          host: "cache.example.com",
          port: 6379,
          databaseName: "0",
          maskedConnection: "redis://default:********@cache.example.com:6379/0",
        },
        providerManaged: false,
        createdAt,
      })._unsafeUnwrap();
      const managedResource = ResourceInstance.createPostgresDependencyResource({
        id: ResourceInstanceId.rehydrate("rsi_managed_pg"),
        projectId: ProjectId.rehydrate("prj_demo"),
        environmentId: EnvironmentId.rehydrate("env_demo"),
        name: ResourceInstanceName.rehydrate("Managed DB"),
        kind: ResourceInstanceKindValue.rehydrate("postgres"),
        sourceMode: DependencyResourceSourceModeValue.rehydrate("appaloft-managed"),
        providerKey: ProviderKey.rehydrate("appaloft-managed-postgres"),
        providerManaged: true,
        providerRealization: {
          status: DependencyResourceProviderRealizationStatusValue.pending(),
          attemptId: DependencyResourceProviderRealizationAttemptId.rehydrate("dpr_1"),
          attemptedAt: OccurredAt.rehydrate("2026-01-01T00:00:00.000Z"),
        },
        createdAt,
      })._unsafeUnwrap();
      managedResource
        .markProviderRealized({
          attemptId: DependencyResourceProviderRealizationAttemptId.rehydrate("dpr_1"),
          providerResourceHandle:
            DependencyResourceProviderResourceHandle.rehydrate("pg/rsi_managed_pg"),
          endpoint: {
            host: "managed.postgres.internal",
            port: 5432,
            databaseName: "managed_db",
            maskedConnection: "postgres://app:********@managed.postgres.internal:5432/managed_db",
          },
          connectionSecretRef: DependencyResourceSecretRef.rehydrate(
            "secret://dependency/postgres/rsi_managed_pg",
          ),
          realizedAt: OccurredAt.rehydrate("2026-01-01T00:00:00.000Z"),
        })
        ._unsafeUnwrap();

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
      await dependencyResources.upsert(
        context,
        redisResource,
        UpsertResourceInstanceSpec.fromResourceInstance(redisResource),
      );
      await dependencyResources.upsert(
        context,
        managedResource,
        UpsertResourceInstanceSpec.fromResourceInstance(managedResource),
      );

      const persisted = await dependencyResources.findOne(
        context,
        ResourceInstanceByIdSpec.create(ResourceInstanceId.rehydrate("rsi_pg")),
      );
      const summary = await readModel.findOne(
        context,
        ResourceInstanceByIdSpec.create(ResourceInstanceId.rehydrate("rsi_pg")),
      );
      const redisSummary = await readModel.findOne(
        context,
        ResourceInstanceByIdSpec.create(ResourceInstanceId.rehydrate("rsi_redis")),
      );
      const managedSummary = await readModel.findOne(
        context,
        ResourceInstanceByIdSpec.create(ResourceInstanceId.rehydrate("rsi_managed_pg")),
      );

      expect(persisted?.toState().postgresEndpoint?.maskedConnection.value).toContain("********");
      expect(summary).toMatchObject({
        id: "rsi_pg",
        connection: {
          host: "db.example.com",
          maskedConnection: "postgres://app:********@db.example.com:5432/app",
        },
        backupRelationship: {
          retentionRequired: true,
        },
      });
      expect(JSON.stringify(summary)).not.toContain("secret");
      expect(redisSummary).toMatchObject({
        id: "rsi_redis",
        kind: "redis",
        connection: {
          host: "cache.example.com",
          maskedConnection: "redis://default:********@cache.example.com:6379/0",
        },
      });
      expect(JSON.stringify(redisSummary)).not.toContain("super-secret");
      expect(managedSummary).toMatchObject({
        id: "rsi_managed_pg",
        lifecycleStatus: "ready",
        bindingReadiness: { status: "ready" },
        providerRealization: {
          status: "ready",
          providerResourceHandle: "pg/rsi_managed_pg",
        },
        connection: {
          secretRef: "secret://dependency/postgres/rsi_managed_pg",
          maskedConnection: "postgres://app:********@managed.postgres.internal:5432/managed_db",
        },
      });
      expect(JSON.stringify(managedSummary)).not.toContain("password");
    } finally {
      await database.close();
      rmSync(dataDir, { force: true, recursive: true });
    }
  });
});
