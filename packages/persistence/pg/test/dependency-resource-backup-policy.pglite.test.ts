import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionContext, toRepositoryContext } from "@appaloft/application";
import { type Kysely } from "kysely";

import { type Database } from "../src";

function organizationContext(organizationId: string) {
  return toRepositoryContext(
    createExecutionContext({
      requestId: `req_dependency_resource_backup_policy_${organizationId}`,
      entrypoint: "system",
      principal: {
        kind: "user",
        actorId: `usr_${organizationId}`,
        userId: `usr_${organizationId}`,
        activeOrganization: {
          organizationId,
          role: "owner",
          productRole: "owner",
        },
      },
    }),
  );
}

async function seedDependencyResourceOwners(db: Kysely<Database>) {
  await db
    .insertInto("projects")
    .values([
      {
        id: "prj_backup_alpha",
        organization_id: "org_backup_alpha",
        name: "Alpha Backup",
        slug: "alpha-backup",
        description: null,
        lifecycle_status: "active",
        archived_at: null,
        archive_reason: null,
        created_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "prj_backup_beta",
        organization_id: "org_backup_beta",
        name: "Beta Backup",
        slug: "beta-backup",
        description: null,
        lifecycle_status: "active",
        archived_at: null,
        archive_reason: null,
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ])
    .execute();

  await db
    .insertInto("environments")
    .values([
      {
        id: "env_backup_alpha",
        project_id: "prj_backup_alpha",
        name: "Production",
        kind: "production",
        parent_environment_id: null,
        lifecycle_status: "active",
        locked_at: null,
        lock_reason: null,
        archived_at: null,
        archive_reason: null,
        created_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "env_backup_beta",
        project_id: "prj_backup_beta",
        name: "Production",
        kind: "production",
        parent_environment_id: null,
        lifecycle_status: "active",
        locked_at: null,
        lock_reason: null,
        archived_at: null,
        archive_reason: null,
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ])
    .execute();

  await db
    .insertInto("dependency_resources")
    .values([
      {
        id: "rsi_backup_alpha",
        project_id: "prj_backup_alpha",
        environment_id: "env_backup_alpha",
        name: "Alpha DB",
        slug: "alpha-db",
        kind: "postgres",
        source_mode: "imported-external",
        provider_key: "external-postgres",
        provider_managed: false,
        description: null,
        endpoint: null,
        connection_secret_ref: null,
        provider_realization: null,
        backup_relationship: null,
        binding_readiness: null,
        lifecycle_status: "active",
        created_at: "2026-01-01T00:00:00.000Z",
        deleted_at: null,
      },
      {
        id: "rsi_backup_beta",
        project_id: "prj_backup_beta",
        environment_id: "env_backup_beta",
        name: "Beta DB",
        slug: "beta-db",
        kind: "postgres",
        source_mode: "imported-external",
        provider_key: "external-postgres",
        provider_managed: false,
        description: null,
        endpoint: null,
        connection_secret_ref: null,
        provider_realization: null,
        backup_relationship: null,
        binding_readiness: null,
        lifecycle_status: "active",
        created_at: "2026-01-01T00:00:00.000Z",
        deleted_at: null,
      },
    ])
    .execute();
}

describe("dependency resource backup policy persistence", () => {
  test("[DEP-RES-BACKUP-POLICY-001] [DEP-RES-BACKUP-POLICY-002] persists and filters scheduled backup policies", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-dependency-backup-policy-"));
    const { createDatabase, createMigrator, PgDependencyResourceBackupPolicyRepository } =
      await import("../src");
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: dataDir,
    });

    try {
      const migrationResult = await createMigrator(database.db).migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      const context = toRepositoryContext(
        createExecutionContext({
          requestId: "req_dependency_resource_backup_policy_pglite_test",
          entrypoint: "system",
        }),
      );
      const repository = new PgDependencyResourceBackupPolicyRepository(database.db);

      await repository.upsert(context, {
        id: "dbp_pg",
        version: "v1",
        dependencyResourceId: "rsi_pg",
        retentionDays: 14,
        scheduleIntervalHours: 6,
        providerKey: "appaloft-managed-postgres",
        retryOnFailure: true,
        enabled: true,
        lastRunAt: null,
        nextRunAt: "2026-01-15T00:00:00.000Z",
        updatedAt: "2026-01-15T00:00:00.000Z",
      });
      await repository.upsert(context, {
        id: "dbp_redis",
        version: "v1",
        dependencyResourceId: "rsi_redis",
        retentionDays: 7,
        scheduleIntervalHours: 12,
        providerKey: null,
        retryOnFailure: false,
        enabled: false,
        lastRunAt: null,
        nextRunAt: "2026-01-16T00:00:00.000Z",
        updatedAt: "2026-01-15T00:00:00.000Z",
      });

      const due = await repository.listRecords(context, {
        enabledOnly: true,
        dueAt: "2026-01-15T00:00:00.000Z",
      });
      const shown = await repository.findOne(context, "dbp_pg");
      const marked = await repository.markRun(context, {
        policyId: "dbp_pg",
        lastRunAt: "2026-01-15T00:00:00.000Z",
        nextRunAt: "2026-01-15T06:00:00.000Z",
        updatedAt: "2026-01-15T00:00:01.000Z",
      });

      expect(due._unsafeUnwrap().map((record) => record.id)).toEqual(["dbp_pg"]);
      expect(shown._unsafeUnwrap()).toMatchObject({
        id: "dbp_pg",
        dependencyResourceId: "rsi_pg",
        retentionDays: 14,
        scheduleIntervalHours: 6,
        providerKey: "appaloft-managed-postgres",
      });
      expect(marked._unsafeUnwrap()).toMatchObject({
        id: "dbp_pg",
        lastRunAt: "2026-01-15T00:00:00.000Z",
        nextRunAt: "2026-01-15T06:00:00.000Z",
      });
    } finally {
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test("[TENANT-REPOSITORY-BACKUP-POLICY-001] scopes dependency resource backup policies through dependency resource ownership", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-dependency-backup-policy-tenant-"));
    const { createDatabase, createMigrator, PgDependencyResourceBackupPolicyRepository } =
      await import("../src");
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: dataDir,
    });

    try {
      const migrationResult = await createMigrator(database.db).migrateToLatest();
      expect(migrationResult.error).toBeUndefined();
      await seedDependencyResourceOwners(database.db);

      const alphaContext = organizationContext("org_backup_alpha");
      const betaContext = organizationContext("org_backup_beta");
      const repository = new PgDependencyResourceBackupPolicyRepository(database.db);

      await repository.upsert(alphaContext, {
        id: "dbp_alpha",
        version: "v1",
        dependencyResourceId: "rsi_backup_alpha",
        retentionDays: 14,
        scheduleIntervalHours: 6,
        providerKey: "external-postgres",
        retryOnFailure: true,
        enabled: true,
        lastRunAt: null,
        nextRunAt: "2026-01-15T00:00:00.000Z",
        updatedAt: "2026-01-15T00:00:00.000Z",
      });
      await repository.upsert(betaContext, {
        id: "dbp_beta",
        version: "v1",
        dependencyResourceId: "rsi_backup_beta",
        retentionDays: 7,
        scheduleIntervalHours: 12,
        providerKey: "external-postgres",
        retryOnFailure: false,
        enabled: true,
        lastRunAt: null,
        nextRunAt: "2026-01-15T00:00:00.000Z",
        updatedAt: "2026-01-15T00:00:00.000Z",
      });

      expect(
        (await repository.listRecords(alphaContext, { enabledOnly: true }))
          ._unsafeUnwrap()
          .map((record) => record.id),
      ).toEqual(["dbp_alpha"]);
      expect((await repository.findOne(alphaContext, "dbp_beta"))._unsafeUnwrap()).toBeNull();
      expect(
        (
          await repository.markRun(alphaContext, {
            policyId: "dbp_beta",
            lastRunAt: "2026-01-15T00:00:00.000Z",
            nextRunAt: "2026-01-15T06:00:00.000Z",
            updatedAt: "2026-01-15T00:00:01.000Z",
          })
        ).isErr(),
      ).toBe(true);
      expect(
        (
          await repository.upsert(alphaContext, {
            id: "dbp_cross",
            version: "v1",
            dependencyResourceId: "rsi_backup_beta",
            retentionDays: 7,
            scheduleIntervalHours: 12,
            providerKey: "external-postgres",
            retryOnFailure: false,
            enabled: true,
            lastRunAt: null,
            nextRunAt: "2026-01-15T00:00:00.000Z",
            updatedAt: "2026-01-15T00:00:00.000Z",
          })
        ).isErr(),
      ).toBe(true);
    } finally {
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
