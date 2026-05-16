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
  CreatedAt,
  defaultSelfHostedOrganizationId,
  Project,
  ProjectId,
  ProjectName,
  UpsertProjectSpec,
} from "@appaloft/core";
import { type Kysely } from "kysely";

interface LegacyProjectOwnershipDatabase {
  projects: {
    created_at: string;
    description: string | null;
    id: string;
    name: string;
    organization_id?: string;
    slug: string;
  };
}

function createRepositoryContext(): RepositoryContext {
  return toRepositoryContext(
    createExecutionContext({
      entrypoint: "system",
      requestId: "req_project_ownership_pglite_test",
    }),
  );
}

function createDataDir(): string {
  return mkdtempSync(join(tmpdir(), "appaloft-project-ownership-"));
}

describe("project organization ownership persistence", () => {
  test("[PROJ-OWN-001] project read model exposes default self-hosted organization ownership", async () => {
    const dataDir = createDataDir();
    const { createDatabase, createMigrator, PgProjectReadModel, PgProjectRepository } =
      await import("../src");
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: dataDir,
    });

    try {
      const migrationResult = await createMigrator(database.db).migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      const context = createRepositoryContext();
      const repository = new PgProjectRepository(database.db);
      const readModel = new PgProjectReadModel(database.db);
      const project = Project.create({
        id: ProjectId.rehydrate("prj_default_owner"),
        name: ProjectName.rehydrate("Default Owner"),
        createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
      })._unsafeUnwrap();

      await repository.upsert(context, project, UpsertProjectSpec.fromProject(project));

      await expect(
        readModel.findProjectOrganization(context, { projectId: "prj_default_owner" }),
      ).resolves.toEqual({
        organizationId: defaultSelfHostedOrganizationId,
        projectId: "prj_default_owner",
      });
      await expect(
        readModel.list(context, { organizationId: defaultSelfHostedOrganizationId }),
      ).resolves.toEqual([
        expect.objectContaining({
          id: "prj_default_owner",
          organizationId: defaultSelfHostedOrganizationId,
        }),
      ]);
      await expect(readModel.list(context, { organizationId: "org_other" })).resolves.toEqual([]);
    } finally {
      await database.close();
      rmSync(dataDir, { force: true, recursive: true });
    }
  });

  test("[PROJ-OWN-002] migration backfills existing project rows to the default organization", async () => {
    const dataDir = createDataDir();
    const { createDatabase } = await import("../src");
    const { projectOrganizationOwnershipMigration } = await import(
      "../src/migrations/075_project_organization_ownership"
    );
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: dataDir,
    });
    const legacyDb = database.db as unknown as Kysely<LegacyProjectOwnershipDatabase>;

    try {
      await legacyDb.schema
        .createTable("projects")
        .addColumn("id", "text", (column) => column.primaryKey())
        .addColumn("name", "text", (column) => column.notNull())
        .addColumn("slug", "text", (column) => column.notNull().unique())
        .addColumn("description", "text")
        .addColumn("created_at", "timestamptz", (column) => column.notNull())
        .execute();
      await legacyDb
        .insertInto("projects")
        .values({
          id: "prj_legacy",
          name: "Legacy Project",
          slug: "legacy-project",
          created_at: "2026-01-01T00:00:00.000Z",
        })
        .execute();

      await projectOrganizationOwnershipMigration.up(database.db);

      const row = await legacyDb
        .selectFrom("projects")
        .select(["organization_id"])
        .where("id", "=", "prj_legacy")
        .executeTakeFirstOrThrow();

      expect(row.organization_id).toBe(defaultSelfHostedOrganizationId);
    } finally {
      await database.close();
      rmSync(dataDir, { force: true, recursive: true });
    }
  });
});
