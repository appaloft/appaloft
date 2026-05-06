import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createExecutionContext,
  type PreviewPolicyRecord,
  toRepositoryContext,
} from "@appaloft/application";
import { type Kysely } from "kysely";

import { type Database } from "../src";

async function seedPreviewPolicyOwners(db: Kysely<Database>) {
  await db
    .insertInto("projects")
    .values({
      id: "prj_preview_policy",
      name: "Preview Policy Project",
      slug: "preview-policy-project",
      description: null,
      lifecycle_status: "active",
      archived_at: null,
      archive_reason: null,
      created_at: "2026-05-06T00:00:00.000Z",
    })
    .execute();

  await db
    .insertInto("environments")
    .values({
      id: "env_preview_policy",
      project_id: "prj_preview_policy",
      name: "Preview",
      kind: "preview",
      parent_environment_id: null,
      lifecycle_status: "active",
      locked_at: null,
      lock_reason: null,
      archived_at: null,
      archive_reason: null,
      created_at: "2026-05-06T00:00:00.000Z",
    })
    .execute();

  await db
    .insertInto("resources")
    .values({
      id: "res_preview_policy_api",
      project_id: "prj_preview_policy",
      environment_id: "env_preview_policy",
      destination_id: null,
      name: "Preview Policy API",
      slug: "preview-policy-api",
      kind: "application",
      description: null,
      services: [],
      source_binding: null,
      runtime_profile: null,
      network_profile: null,
      access_profile: null,
      auto_deploy_policy: null,
      lifecycle_status: "active",
      archived_at: null,
      archive_reason: null,
      deleted_at: null,
      created_at: "2026-05-06T00:00:00.000Z",
    })
    .execute();
}

function contextFixture() {
  return toRepositoryContext(
    createExecutionContext({
      requestId: "req_preview_policy_pglite_test",
      entrypoint: "system",
    }),
  );
}

describe("preview policy persistence", () => {
  test("[PG-PREVIEW-SURFACE-001] persists preview policy records and default summaries safely", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-preview-policy-"));
    const { createDatabase, createMigrator, PgPreviewPolicyRepository } = await import("../src");
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: dataDir,
    });

    try {
      const migrationResult = await createMigrator(database.db).migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      await seedPreviewPolicyOwners(database.db);
      const context = contextFixture();
      const repository = new PgPreviewPolicyRepository(database.db);
      const scope = {
        kind: "resource" as const,
        projectId: "prj_preview_policy",
        resourceId: "res_preview_policy_api",
      };
      const defaultSummary = await repository.findOneSummary(context, scope);

      expect(defaultSummary).toEqual({
        scope,
        source: "default",
        settings: {
          sameRepositoryPreviews: true,
          forkPreviews: "disabled",
          secretBackedPreviews: true,
        },
      });

      const firstRecord: PreviewPolicyRecord = {
        id: "pvp_preview_policy",
        scope,
        settings: {
          sameRepositoryPreviews: true,
          forkPreviews: "without-secrets",
          secretBackedPreviews: false,
        },
        updatedAt: "2026-05-06T01:00:00.000Z",
        idempotencyKey: "idem_preview_policy_1",
      };

      await repository.upsert(context, firstRecord);

      expect(await repository.findOne(context, scope)).toEqual(firstRecord);
      expect(await repository.findOneSummary(context, scope)).toEqual({
        id: "pvp_preview_policy",
        scope,
        source: "configured",
        settings: {
          sameRepositoryPreviews: true,
          forkPreviews: "without-secrets",
          secretBackedPreviews: false,
        },
        updatedAt: "2026-05-06T01:00:00.000Z",
      });
      expect(JSON.stringify(await repository.findOneSummary(context, scope))).not.toContain(
        "idem_preview_policy_1",
      );
      expect(JSON.stringify(await repository.findOneSummary(context, scope))).not.toContain(
        "secretRef",
      );
    } finally {
      await database.close();
      rmSync(dataDir, { force: true, recursive: true });
    }
  });

  test("[PG-PREVIEW-SURFACE-001] upserts project and resource policies by scoped identity", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-preview-policy-scope-"));
    const { createDatabase, createMigrator, PgPreviewPolicyRepository } = await import("../src");
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: dataDir,
    });

    try {
      const migrationResult = await createMigrator(database.db).migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      await seedPreviewPolicyOwners(database.db);
      const context = contextFixture();
      const repository = new PgPreviewPolicyRepository(database.db);
      const projectScope = {
        kind: "project" as const,
        projectId: "prj_preview_policy",
      };
      const resourceScope = {
        kind: "resource" as const,
        projectId: "prj_preview_policy",
        resourceId: "res_preview_policy_api",
      };

      await repository.upsert(context, {
        id: "pvp_project",
        scope: projectScope,
        settings: {
          sameRepositoryPreviews: false,
          forkPreviews: "disabled",
          secretBackedPreviews: false,
        },
        updatedAt: "2026-05-06T01:00:00.000Z",
      });
      await repository.upsert(context, {
        id: "pvp_resource",
        scope: resourceScope,
        settings: {
          sameRepositoryPreviews: true,
          forkPreviews: "with-secrets",
          secretBackedPreviews: true,
        },
        updatedAt: "2026-05-06T01:05:00.000Z",
        idempotencyKey: "idem_preview_policy_resource_1",
      });
      await repository.upsert(context, {
        id: "pvp_resource",
        scope: resourceScope,
        settings: {
          sameRepositoryPreviews: true,
          forkPreviews: "without-secrets",
          secretBackedPreviews: false,
        },
        updatedAt: "2026-05-06T01:10:00.000Z",
        idempotencyKey: "idem_preview_policy_resource_2",
      });

      expect((await repository.findOne(context, projectScope))?.settings).toEqual({
        sameRepositoryPreviews: false,
        forkPreviews: "disabled",
        secretBackedPreviews: false,
      });
      expect(await repository.findOne(context, resourceScope)).toEqual({
        id: "pvp_resource",
        scope: resourceScope,
        settings: {
          sameRepositoryPreviews: true,
          forkPreviews: "without-secrets",
          secretBackedPreviews: false,
        },
        updatedAt: "2026-05-06T01:10:00.000Z",
        idempotencyKey: "idem_preview_policy_resource_2",
      });
    } finally {
      await database.close();
      rmSync(dataDir, { force: true, recursive: true });
    }
  });
});
