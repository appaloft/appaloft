import "reflect-metadata";
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createExecutionContext,
  type RepositoryContext,
  toRepositoryContext,
} from "@appaloft/application";
import {
  BuildStrategyKindValue,
  ConfigKey,
  ConfigScopeValue,
  ConfigValueText,
  CreatedAt,
  Deployment,
  DeploymentId,
  DeploymentLogEntry,
  DeploymentPhaseValue,
  DeploymentTargetDescriptor,
  DeploymentTargetId,
  DeploymentTargetName,
  Destination,
  DestinationId,
  DestinationKindValue,
  DestinationName,
  DetectSummary,
  DisplayNameText,
  EnvironmentId,
  EnvironmentKindValue,
  EnvironmentName,
  EnvironmentProfile,
  EnvironmentSnapshotId,
  ExecutionResult,
  ExecutionStatusValue,
  ExecutionStrategyKindValue,
  ExitCode,
  FinishedAt,
  GeneratedAt,
  HostAddress,
  ImageReference,
  LogLevelValue,
  MessageText,
  OccurredAt,
  PackagingModeValue,
  PlanStepText,
  PortNumber,
  Project,
  ProjectId,
  ProjectName,
  ProviderKey,
  Resource,
  ResourceExposureModeValue,
  ResourceId,
  ResourceKindValue,
  ResourceName,
  ResourceNetworkProtocolValue,
  RuntimeExecutionPlan,
  RuntimePlan,
  RuntimePlanId,
  Server,
  SourceDescriptor,
  SourceKindValue,
  SourceLocator,
  StartedAt,
  TargetKindValue,
  UpdatedAt,
  UpsertDeploymentSpec,
  UpsertDestinationSpec,
  UpsertEnvironmentSpec,
  UpsertProjectSpec,
  UpsertResourceSpec,
  UpsertServerSpec,
  VariableExposureValue,
  VariableKindValue,
} from "@appaloft/core";
import { type Kysely, sql } from "kysely";
import { type Database } from "../src/schema";

function createRepositoryContext(): RepositoryContext {
  return toRepositoryContext(
    createExecutionContext({
      entrypoint: "system",
      requestId: "req_pglite_test",
      tracer: {
        startActiveSpan(_name, _options, callback) {
          return Promise.resolve(
            callback({
              addEvent() {},
              recordError() {},
              setAttribute() {},
              setAttributes() {},
              setStatus() {},
            }),
          );
        },
      },
    }),
  );
}

async function seedSourceLinkContext(
  db: Kysely<Database>,
  suffix: string,
  input?: {
    lifecycleStatus?: string;
    archivedAt?: string;
  },
): Promise<{
  projectId: string;
  environmentId: string;
  resourceId: string;
  serverId: string;
  destinationId: string;
}> {
  const projectId = `prj_source_${suffix}`;
  const serverId = `srv_source_${suffix}`;
  const destinationId = `dst_source_${suffix}`;
  const environmentId = `env_source_${suffix}`;
  const resourceId = `res_source_${suffix}`;
  const createdAt = "2026-01-01T00:00:00.000Z";

  await db
    .insertInto("projects")
    .values({
      id: projectId,
      name: `Source ${suffix}`,
      slug: `source-${suffix}`,
      description: null,
      created_at: createdAt,
    })
    .execute();

  await db
    .insertInto("servers")
    .values({
      id: serverId,
      name: `source-${suffix}`,
      host: "127.0.0.1",
      port: 22,
      provider_key: "generic-ssh",
      edge_proxy_kind: null,
      edge_proxy_status: null,
      edge_proxy_last_attempt_at: null,
      edge_proxy_last_succeeded_at: null,
      edge_proxy_last_error_code: null,
      edge_proxy_last_error_message: null,
      credential_id: null,
      credential_kind: null,
      credential_username: null,
      credential_public_key: null,
      credential_private_key: null,
      created_at: createdAt,
    })
    .execute();

  await db
    .insertInto("destinations")
    .values({
      id: destinationId,
      server_id: serverId,
      name: "default",
      kind: "generic",
      created_at: createdAt,
    })
    .execute();

  await db
    .insertInto("environments")
    .values({
      id: environmentId,
      project_id: projectId,
      name: "production",
      kind: "production",
      parent_environment_id: null,
      created_at: createdAt,
    })
    .execute();

  await db
    .insertInto("resources")
    .values({
      id: resourceId,
      project_id: projectId,
      environment_id: environmentId,
      destination_id: destinationId,
      name: "web",
      slug: `web-${suffix}`,
      kind: "application",
      description: null,
      services: [],
      source_binding: null,
      runtime_profile: null,
      network_profile: null,
      lifecycle_status: input?.lifecycleStatus ?? "active",
      archived_at: input?.archivedAt ?? null,
      archive_reason: null,
      deleted_at: null,
      created_at: createdAt,
    })
    .execute();

  return {
    projectId,
    environmentId,
    resourceId,
    serverId,
    destinationId,
  };
}

describe("pglite persistence integration", () => {
  test("persists environments and deployments to a file-backed embedded store", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-pglite-"));
    const pgliteDataDir = join(workspaceDir, ".appaloft", "data", "pglite");
    const context = createRepositoryContext();

    try {
      const suffix = crypto.randomUUID().slice(0, 8);
      const {
        createDatabase,
        createMigrator,
        PgDeploymentReadModel,
        PgDeploymentRepository,
        PgDestinationRepository,
        PgEnvironmentReadModel,
        PgEnvironmentRepository,
        PgProjectRepository,
        PgResourceRepository,
        PgServerRepository,
      } = await import("../src/index");
      const database = await createDatabase({
        driver: "pglite",
        pgliteDataDir,
      });
      const migrator = createMigrator(database.db);
      await migrator.migrateToLatest();

      const projectRepository = new PgProjectRepository(database.db);
      const serverRepository = new PgServerRepository(database.db);
      const destinationRepository = new PgDestinationRepository(database.db);
      const environmentRepository = new PgEnvironmentRepository(database.db);
      const resourceRepository = new PgResourceRepository(database.db);
      const deploymentRepository = new PgDeploymentRepository(database.db);

      const project = Project.create({
        id: ProjectId.rehydrate(`prj_${suffix}`),
        name: ProjectName.rehydrate(`Embedded ${suffix}`),
        createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
      })._unsafeUnwrap();
      const server = Server.register({
        id: DeploymentTargetId.rehydrate(`srv_${suffix}`),
        name: DeploymentTargetName.rehydrate(`embedded-${suffix}`),
        host: HostAddress.rehydrate("127.0.0.1"),
        port: PortNumber.rehydrate(22),
        providerKey: ProviderKey.rehydrate("generic-ssh"),
        createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
      })._unsafeUnwrap();
      const destination = Destination.register({
        id: DestinationId.rehydrate(`dst_${suffix}`),
        serverId: DeploymentTargetId.rehydrate(`srv_${suffix}`),
        name: DestinationName.rehydrate("default"),
        kind: DestinationKindValue.rehydrate("generic"),
        createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
      })._unsafeUnwrap();
      const environment = EnvironmentProfile.create({
        id: EnvironmentId.rehydrate(`env_${suffix}`),
        projectId: ProjectId.rehydrate(`prj_${suffix}`),
        name: EnvironmentName.rehydrate("local"),
        kind: EnvironmentKindValue.rehydrate("local"),
        createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
      })._unsafeUnwrap();
      const resource = Resource.create({
        id: ResourceId.rehydrate(`res_${suffix}`),
        projectId: ProjectId.rehydrate(`prj_${suffix}`),
        environmentId: EnvironmentId.rehydrate(`env_${suffix}`),
        destinationId: DestinationId.rehydrate(`dst_${suffix}`),
        name: ResourceName.rehydrate("web"),
        kind: ResourceKindValue.rehydrate("application"),
        networkProfile: {
          internalPort: PortNumber.rehydrate(3000),
          upstreamProtocol: ResourceNetworkProtocolValue.rehydrate("http"),
          exposureMode: ResourceExposureModeValue.rehydrate("reverse-proxy"),
        },
        createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
      })._unsafeUnwrap();

      environment.setVariable({
        key: ConfigKey.rehydrate("PUBLIC_SITE_NAME"),
        value: ConfigValueText.rehydrate("embedded-appaloft"),
        kind: VariableKindValue.rehydrate("plain-config"),
        exposure: VariableExposureValue.rehydrate("build-time"),
        scope: ConfigScopeValue.rehydrate("environment"),
        isSecret: false,
        updatedAt: UpdatedAt.rehydrate("2026-01-01T00:01:00.000Z"),
      });

      await projectRepository.upsert(context, project, UpsertProjectSpec.fromProject(project));
      await serverRepository.upsert(context, server, UpsertServerSpec.fromServer(server));
      await destinationRepository.upsert(
        context,
        destination,
        UpsertDestinationSpec.fromDestination(destination),
      );
      await environmentRepository.upsert(
        context,
        environment,
        UpsertEnvironmentSpec.fromEnvironment(environment),
      );
      await resourceRepository.upsert(context, resource, UpsertResourceSpec.fromResource(resource));

      const deployment = Deployment.create({
        id: DeploymentId.rehydrate(`dep_${suffix}`),
        projectId: ProjectId.rehydrate(`prj_${suffix}`),
        serverId: DeploymentTargetId.rehydrate(`srv_${suffix}`),
        destinationId: DestinationId.rehydrate(`dst_${suffix}`),
        environmentId: EnvironmentId.rehydrate(`env_${suffix}`),
        resourceId: ResourceId.rehydrate(`res_${suffix}`),
        runtimePlan: RuntimePlan.rehydrate({
          id: RuntimePlanId.rehydrate(`plan_${suffix}`),
          source: SourceDescriptor.rehydrate({
            kind: SourceKindValue.rehydrate("local-folder"),
            locator: SourceLocator.rehydrate("."),
            displayName: DisplayNameText.rehydrate("workspace"),
          }),
          buildStrategy: BuildStrategyKindValue.rehydrate("dockerfile"),
          packagingMode: PackagingModeValue.rehydrate("all-in-one-docker"),
          execution: RuntimeExecutionPlan.rehydrate({
            kind: ExecutionStrategyKindValue.rehydrate("docker-container"),
            image: ImageReference.rehydrate("demo:test"),
            port: PortNumber.rehydrate(3000),
          }),
          target: DeploymentTargetDescriptor.rehydrate({
            kind: TargetKindValue.rehydrate("single-server"),
            providerKey: ProviderKey.rehydrate("generic-ssh"),
            serverIds: [DeploymentTargetId.rehydrate(`srv_${suffix}`)],
          }),
          detectSummary: DetectSummary.rehydrate("pglite integration test"),
          steps: [
            PlanStepText.rehydrate("package"),
            PlanStepText.rehydrate("deploy"),
            PlanStepText.rehydrate("verify"),
          ],
          generatedAt: GeneratedAt.rehydrate("2026-01-01T00:02:00.000Z"),
        }),
        environmentSnapshot: environment.materializeSnapshot({
          snapshotId: EnvironmentSnapshotId.rehydrate(`snap_${suffix}`),
          createdAt: GeneratedAt.rehydrate("2026-01-01T00:02:00.000Z"),
        }),
        createdAt: CreatedAt.rehydrate("2026-01-01T00:02:00.000Z"),
      })._unsafeUnwrap();

      deployment.markPlanning(StartedAt.rehydrate("2026-01-01T00:02:00.000Z"))._unsafeUnwrap();
      deployment.markPlanned(StartedAt.rehydrate("2026-01-01T00:02:01.000Z"))._unsafeUnwrap();
      deployment.start(StartedAt.rehydrate("2026-01-01T00:02:02.000Z"))._unsafeUnwrap();
      deployment.applyExecutionResult(
        FinishedAt.rehydrate("2026-01-01T00:02:03.000Z"),
        ExecutionResult.rehydrate({
          exitCode: ExitCode.rehydrate(0),
          status: ExecutionStatusValue.rehydrate("succeeded"),
          retryable: false,
          logs: [
            DeploymentLogEntry.rehydrate({
              timestamp: OccurredAt.rehydrate("2026-01-01T00:02:03.000Z"),
              phase: DeploymentPhaseValue.rehydrate("verify"),
              level: LogLevelValue.rehydrate("info"),
              message: MessageText.rehydrate("embedded deployment persisted"),
            }),
          ],
          metadata: {
            "source.commitSha": "57ea0764b8f0a491fd1d30bedc5cbe281744b36c",
          },
        }),
      );

      await deploymentRepository.upsert(
        context,
        deployment,
        UpsertDeploymentSpec.fromDeployment(deployment),
      );
      await database.close();

      const reopened = await createDatabase({
        driver: "pglite",
        pgliteDataDir,
      });
      const reopenedMigrator = createMigrator(reopened.db);
      const migrationStatus = await reopenedMigrator.getMigrations();
      const environmentReadModel = new PgEnvironmentReadModel(reopened.db, "****");
      const deploymentReadModel = new PgDeploymentReadModel(reopened.db);

      const environments = await environmentReadModel.list(context, `prj_${suffix}`);
      const deployments = await deploymentReadModel.list(context, { projectId: `prj_${suffix}` });

      expect(migrationStatus.every((migration) => migration.executedAt !== undefined)).toBe(true);
      expect(environments[0]?.maskedVariables).toEqual([
        expect.objectContaining({
          key: "PUBLIC_SITE_NAME",
          value: "embedded-appaloft",
          isSecret: false,
        }),
      ]);
      expect(deployments[0]?.environmentSnapshot.id).toBe(`snap_${suffix}`);
      expect(deployments[0]?.sourceCommitSha).toBe("57ea0764b8f0a491fd1d30bedc5cbe281744b36c");
      expect(deployments[0]?.logCount).toBe(1);

      await reopened.close();
    } finally {
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  }, 15000);

  test("[RES-PROFILE-DELETE-006] reads audit-retention deletion blockers", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-pglite-delete-blockers-"));
    const pgliteDataDir = join(workspaceDir, ".appaloft", "data", "pglite");
    const context = createRepositoryContext();
    let closeDatabase: (() => Promise<void>) | undefined;

    try {
      const { createDatabase, createMigrator, PgResourceDeletionBlockerReader } = await import(
        "../src/index"
      );
      const database = await createDatabase({
        driver: "pglite",
        pgliteDataDir,
      });
      closeDatabase = () => database.close();
      const migrator = createMigrator(database.db);
      const migrationResult = await migrator.migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      await database.db
        .insertInto("audit_logs")
        .values({
          id: "audit_res_web",
          aggregate_id: "res_web",
          event_type: "resource-archived",
          payload: {
            resourceId: "res_web",
          },
          created_at: "2026-01-01T00:00:00.000Z",
        })
        .execute();

      const reader = new PgResourceDeletionBlockerReader(database.db);
      const result = await reader.findBlockers(context, {
        resourceId: "res_web",
      });

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toContainEqual({
        kind: "audit-retention",
        relatedEntityId: "audit_res_web",
        relatedEntityType: "audit-log",
        count: 1,
      });
    } finally {
      await closeDatabase?.();
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  }, 15000);

  test("[SOURCE-LINK-STATE-015] pg source link store persists and reads mappings", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-pglite-source-links-"));
    const pgliteDataDir = join(workspaceDir, ".appaloft", "data", "pglite");
    let closeDatabase: (() => Promise<void>) | undefined;

    try {
      const { createDatabase, createMigrator, PgSourceLinkStore } = await import("../src/index");
      const database = await createDatabase({
        driver: "pglite",
        pgliteDataDir,
      });
      closeDatabase = () => database.close();
      const migrator = createMigrator(database.db);
      const migrationResult = await migrator.migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      const target = await seedSourceLinkContext(database.db, "persist");
      const store = new PgSourceLinkStore(database.db);
      const sourceFingerprint = "source-fingerprint:v1:branch%3Apersist";

      const created = await store.createIfMissing({
        sourceFingerprint,
        target,
        updatedAt: "2026-01-01T00:01:00.000Z",
      });
      expect(created.isOk()).toBe(true);
      expect(created._unsafeUnwrap()).toEqual({
        sourceFingerprint,
        ...target,
        updatedAt: "2026-01-01T00:01:00.000Z",
      });

      const row = await database.db
        .selectFrom("source_links")
        .selectAll()
        .where("source_fingerprint", "=", sourceFingerprint)
        .executeTakeFirstOrThrow();
      expect(row.metadata).toEqual({});

      const read = await store.read(sourceFingerprint);
      expect(read.isOk()).toBe(true);
      expect(read._unsafeUnwrap()).toEqual(created._unsafeUnwrap());
    } finally {
      await closeDatabase?.();
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  }, 15000);

  test("[SOURCE-LINK-STATE-016] pg source link relink is idempotent and guarded", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-pglite-source-link-guard-"));
    const pgliteDataDir = join(workspaceDir, ".appaloft", "data", "pglite");
    let closeDatabase: (() => Promise<void>) | undefined;

    try {
      const { createDatabase, createMigrator, PgSourceLinkStore } = await import("../src/index");
      const database = await createDatabase({
        driver: "pglite",
        pgliteDataDir,
      });
      closeDatabase = () => database.close();
      const migrator = createMigrator(database.db);
      const migrationResult = await migrator.migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      const target = await seedSourceLinkContext(database.db, "guard");
      const store = new PgSourceLinkStore(database.db);
      const sourceFingerprint = "source-fingerprint:v1:branch%3Aguard";
      const initial = await store.createIfMissing({
        sourceFingerprint,
        target,
        updatedAt: "2026-01-01T00:01:00.000Z",
      });
      expect(initial.isOk()).toBe(true);

      const sameTarget = await store.relink({
        sourceFingerprint,
        target,
        updatedAt: "2026-01-01T00:02:00.000Z",
        expectedCurrentResourceId: target.resourceId,
        reason: "same target",
      });
      expect(sameTarget.isOk()).toBe(true);
      expect(sameTarget._unsafeUnwrap().updatedAt).toBe("2026-01-01T00:01:00.000Z");

      const conflict = await store.relink({
        sourceFingerprint,
        target,
        updatedAt: "2026-01-01T00:03:00.000Z",
        expectedCurrentResourceId: "res_expected_elsewhere",
      });
      expect(conflict.isErr()).toBe(true);
      if (conflict.isOk()) {
        throw new Error("Expected source link conflict");
      }
      expect(conflict.error.code).toBe("source_link_conflict");
      expect(conflict.error.details).toMatchObject({
        phase: "source-link-resolution",
        expectedCurrentResourceId: "res_expected_elsewhere",
        actualResourceId: target.resourceId,
      });

      const rows = await database.db
        .selectFrom("source_links")
        .selectAll()
        .where("source_fingerprint", "=", sourceFingerprint)
        .execute();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.resource_id).toBe(target.resourceId);
      expect(new Date(rows[0]?.updated_at ?? "").toISOString()).toBe("2026-01-01T00:01:00.000Z");
    } finally {
      await closeDatabase?.();
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  }, 15000);

  test("[SOURCE-LINK-STATE-017] resource delete sees pg source link blocker", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-pglite-source-link-blocker-"));
    const pgliteDataDir = join(workspaceDir, ".appaloft", "data", "pglite");
    const context = createRepositoryContext();
    let closeDatabase: (() => Promise<void>) | undefined;

    try {
      const { createDatabase, createMigrator, PgResourceDeletionBlockerReader, PgSourceLinkStore } =
        await import("../src/index");
      const database = await createDatabase({
        driver: "pglite",
        pgliteDataDir,
      });
      closeDatabase = () => database.close();
      const migrator = createMigrator(database.db);
      const migrationResult = await migrator.migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      const target = await seedSourceLinkContext(database.db, "blocker", {
        lifecycleStatus: "archived",
        archivedAt: "2026-01-01T00:02:00.000Z",
      });
      const sourceFingerprint = "source-fingerprint:v1:branch%3Ablocker";
      const store = new PgSourceLinkStore(database.db);
      const created = await store.createIfMissing({
        sourceFingerprint,
        target,
        updatedAt: "2026-01-01T00:03:00.000Z",
      });
      expect(created.isOk()).toBe(true);

      const reader = new PgResourceDeletionBlockerReader(database.db);
      const result = await reader.findBlockers(context, {
        resourceId: target.resourceId,
      });

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toContainEqual({
        kind: "source-link",
        relatedEntityId: sourceFingerprint,
        relatedEntityType: "source-link",
        count: 1,
      });
    } finally {
      await closeDatabase?.();
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  }, 15000);

  test("[SOURCE-LINK-STATE-018] pg source link migration blocks unsafe cascades", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-pglite-source-link-migration-"));
    const pgliteDataDir = join(workspaceDir, ".appaloft", "data", "pglite");
    let closeDatabase: (() => Promise<void>) | undefined;

    try {
      const { createDatabase, createMigrator, PgSourceLinkStore } = await import("../src/index");
      const database = await createDatabase({
        driver: "pglite",
        pgliteDataDir,
      });
      closeDatabase = () => database.close();
      const migrator = createMigrator(database.db);
      const migrationResult = await migrator.migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      const indexes = await sql<{ indexname: string }>`
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'source_links'
      `.execute(database.db);
      expect(indexes.rows.map((row) => row.indexname)).toContain("source_links_resource_id_idx");

      const target = await seedSourceLinkContext(database.db, "migration");
      const sourceFingerprint = "source-fingerprint:v1:branch%3Amigration";
      const store = new PgSourceLinkStore(database.db);
      const created = await store.createIfMissing({
        sourceFingerprint,
        target,
        updatedAt: "2026-01-01T00:01:00.000Z",
      });
      expect(created.isOk()).toBe(true);

      await database.db
        .updateTable("resources")
        .set({
          lifecycle_status: "deleted",
          deleted_at: "2026-01-01T00:02:00.000Z",
        })
        .where("id", "=", target.resourceId)
        .execute();

      const retainedAfterTombstone = await database.db
        .selectFrom("source_links")
        .select("source_fingerprint")
        .where("source_fingerprint", "=", sourceFingerprint)
        .executeTakeFirst();
      expect(retainedAfterTombstone?.source_fingerprint).toBe(sourceFingerprint);

      let physicalDeleteBlocked = false;
      try {
        await database.db.deleteFrom("resources").where("id", "=", target.resourceId).execute();
      } catch {
        physicalDeleteBlocked = true;
      }
      expect(physicalDeleteBlocked).toBe(true);

      const retainedAfterDeleteAttempt = await database.db
        .selectFrom("source_links")
        .select("source_fingerprint")
        .where("source_fingerprint", "=", sourceFingerprint)
        .executeTakeFirst();
      expect(retainedAfterDeleteAttempt?.source_fingerprint).toBe(sourceFingerprint);
    } finally {
      await closeDatabase?.();
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  }, 15000);

  test("backfills legacy server edge proxy intent during migration", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-pglite-migration-"));
    const pgliteDataDir = join(workspaceDir, ".appaloft", "data", "pglite");

    try {
      const { createDatabase, createMigrator } = await import("../src/index");
      const database = await createDatabase({
        driver: "pglite",
        pgliteDataDir,
      });
      const migrator = createMigrator(database.db);
      const legacyMigrationResult = await migrator.migrateTo("010_resource_network_profile");
      expect(legacyMigrationResult.error).toBeUndefined();

      await database.db
        .insertInto("servers")
        .values({
          id: "srv_legacy_proxy",
          name: "legacy-proxy",
          host: "127.0.0.1",
          port: 22,
          provider_key: "generic-ssh",
          created_at: "2026-01-01T00:00:00.000Z",
        })
        .execute();

      const latestMigrationResult = await migrator.migrateToLatest();
      expect(latestMigrationResult.error).toBeUndefined();

      const server = await database.db
        .selectFrom("servers")
        .select(["edge_proxy_kind", "edge_proxy_status"])
        .where("id", "=", "srv_legacy_proxy")
        .executeTakeFirstOrThrow();

      expect(server.edge_proxy_kind).toBe("traefik");
      expect(server.edge_proxy_status).toBe("pending");

      await database.close();
    } finally {
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  }, 15000);
});
