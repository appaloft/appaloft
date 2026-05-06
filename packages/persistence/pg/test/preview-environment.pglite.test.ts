import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionContext, toRepositoryContext } from "@appaloft/application";
import {
  CreatedAt,
  DeletePreviewEnvironmentSpec,
  DeploymentTargetId,
  DestinationId,
  EnvironmentId,
  GitCommitShaText,
  GitRefText,
  PreviewEnvironment,
  PreviewEnvironmentByIdSpec,
  PreviewEnvironmentBySourceScopeSpec,
  PreviewEnvironmentExpiresAt,
  PreviewEnvironmentId,
  PreviewEnvironmentProviderValue,
  PreviewPullRequestNumber,
  ProjectId,
  ResourceId,
  SourceBindingFingerprint,
  SourceRepositoryFullName,
  UpdatedAt,
  UpsertPreviewEnvironmentSpec,
} from "@appaloft/core";
import { type Kysely } from "kysely";

import { type Database } from "../src";

function previewEnvironmentFixture(input?: { id?: string; headSha?: string }) {
  return PreviewEnvironment.create({
    id: PreviewEnvironmentId.rehydrate(input?.id ?? "prenv_demo_42"),
    projectId: ProjectId.rehydrate("prj_preview"),
    environmentId: EnvironmentId.rehydrate("env_preview"),
    resourceId: ResourceId.rehydrate("res_preview_api"),
    serverId: DeploymentTargetId.rehydrate("srv_preview"),
    destinationId: DestinationId.rehydrate("dst_preview"),
    provider: PreviewEnvironmentProviderValue.github(),
    source: {
      repositoryFullName: SourceRepositoryFullName.create("appaloft/demo")._unsafeUnwrap(),
      headRepositoryFullName: SourceRepositoryFullName.create("appaloft/demo")._unsafeUnwrap(),
      pullRequestNumber: PreviewPullRequestNumber.create(42)._unsafeUnwrap(),
      headSha: GitCommitShaText.create(input?.headSha ?? "abc1234")._unsafeUnwrap(),
      baseRef: GitRefText.create("main")._unsafeUnwrap(),
      sourceBindingFingerprint: SourceBindingFingerprint.create("srcfp_preview_42")._unsafeUnwrap(),
    },
    createdAt: CreatedAt.rehydrate("2026-05-06T00:00:00.000Z"),
    expiresAt: PreviewEnvironmentExpiresAt.create("2026-05-13T00:00:00.000Z")._unsafeUnwrap(),
  })._unsafeUnwrap();
}

async function seedPreviewOwners(db: Kysely<Database>) {
  await db
    .insertInto("projects")
    .values({
      id: "prj_preview",
      name: "Preview Project",
      slug: "preview-project",
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
      id: "env_preview",
      project_id: "prj_preview",
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
    .insertInto("servers")
    .values({
      id: "srv_preview",
      name: "Preview Server",
      host: "127.0.0.1",
      port: 22,
      provider_key: "local",
      target_kind: "single-server",
      lifecycle_status: "active",
      deactivated_at: null,
      deactivation_reason: null,
      deleted_at: null,
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
      created_at: "2026-05-06T00:00:00.000Z",
    })
    .execute();

  await db
    .insertInto("destinations")
    .values({
      id: "dst_preview",
      server_id: "srv_preview",
      name: "default",
      kind: "generic",
      created_at: "2026-05-06T00:00:00.000Z",
    })
    .execute();

  await db
    .insertInto("resources")
    .values({
      id: "res_preview_api",
      project_id: "prj_preview",
      environment_id: "env_preview",
      destination_id: "dst_preview",
      name: "Preview API",
      slug: "preview-api",
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

describe("preview environment persistence", () => {
  test("[PG-PREVIEW-ENV-001B] persists preview environment lifecycle state and safe read models", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-preview-environment-"));
    const {
      createDatabase,
      createMigrator,
      PgPreviewEnvironmentReadModel,
      PgPreviewEnvironmentRepository,
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
          requestId: "req_preview_environment_pglite_test",
          entrypoint: "system",
        }),
      );
      await seedPreviewOwners(database.db);

      const repository = new PgPreviewEnvironmentRepository(database.db);
      const readModel = new PgPreviewEnvironmentReadModel(database.db);
      const previewEnvironment = previewEnvironmentFixture();

      await repository.upsert(
        context,
        previewEnvironment,
        UpsertPreviewEnvironmentSpec.fromPreviewEnvironment(previewEnvironment),
      );

      const persistedById = await repository.findOne(
        context,
        PreviewEnvironmentByIdSpec.create(PreviewEnvironmentId.rehydrate("prenv_demo_42")),
      );
      const persistedByScope = await repository.findOne(
        context,
        PreviewEnvironmentBySourceScopeSpec.create({
          provider: PreviewEnvironmentProviderValue.github(),
          repositoryFullName: SourceRepositoryFullName.rehydrate("appaloft/demo"),
          pullRequestNumber: PreviewPullRequestNumber.rehydrate(42),
          resourceId: ResourceId.rehydrate("res_preview_api"),
        }),
      );

      expect(persistedById?.toState().source.headSha.value).toBe("abc1234");
      expect(persistedByScope?.toState().id.value).toBe("prenv_demo_42");

      persistedById
        ?.updateSourceContext({
          source: {
            ...persistedById.toState().source,
            headSha: GitCommitShaText.create("def5678")._unsafeUnwrap(),
          },
          updatedAt: UpdatedAt.rehydrate("2026-05-06T00:05:00.000Z"),
        })
        ._unsafeUnwrap();
      persistedById
        ?.requestCleanup({
          requestedAt: UpdatedAt.rehydrate("2026-05-06T00:10:00.000Z"),
        })
        ._unsafeUnwrap();

      if (persistedById) {
        await repository.upsert(
          context,
          persistedById,
          UpsertPreviewEnvironmentSpec.fromPreviewEnvironment(persistedById),
        );
      }

      const listed = await readModel.list(context, {
        projectId: "prj_preview",
        environmentId: "env_preview",
        resourceId: "res_preview_api",
        status: "cleanup-requested",
        repositoryFullName: "appaloft/demo",
        pullRequestNumber: 42,
      });
      const shown = await readModel.findOne(context, {
        previewEnvironmentId: "prenv_demo_42",
        projectId: "prj_preview",
        resourceId: "res_preview_api",
      });

      expect(listed.items).toHaveLength(1);
      expect(listed.items[0]).toMatchObject({
        previewEnvironmentId: "prenv_demo_42",
        projectId: "prj_preview",
        environmentId: "env_preview",
        resourceId: "res_preview_api",
        serverId: "srv_preview",
        destinationId: "dst_preview",
        status: "cleanup-requested",
      });
      expect(shown?.source).toEqual({
        provider: "github",
        repositoryFullName: "appaloft/demo",
        headRepositoryFullName: "appaloft/demo",
        pullRequestNumber: 42,
        baseRef: "main",
        headSha: "def5678",
        sourceBindingFingerprint: "srcfp_preview_42",
      });
      expect(JSON.stringify(shown)).not.toContain("token");
      expect(JSON.stringify(shown)).not.toContain("secret");
    } finally {
      await database.close();
      rmSync(dataDir, { force: true, recursive: true });
    }
  });

  test("[PG-PREVIEW-ENV-001B] deletes preview environments by scoped identity without touching owner state", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-preview-environment-delete-"));
    const {
      createDatabase,
      createMigrator,
      PgPreviewEnvironmentReadModel,
      PgPreviewEnvironmentRepository,
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
          requestId: "req_preview_environment_delete_pglite_test",
          entrypoint: "system",
        }),
      );
      await seedPreviewOwners(database.db);

      const repository = new PgPreviewEnvironmentRepository(database.db);
      const readModel = new PgPreviewEnvironmentReadModel(database.db);
      const previewEnvironment = previewEnvironmentFixture();
      await repository.upsert(
        context,
        previewEnvironment,
        UpsertPreviewEnvironmentSpec.fromPreviewEnvironment(previewEnvironment),
      );

      await repository.delete(
        context,
        DeletePreviewEnvironmentSpec.create(
          PreviewEnvironmentId.rehydrate("prenv_demo_42"),
          ResourceId.rehydrate("res_preview_api"),
        ),
      );

      const deleted = await readModel.findOne(context, {
        previewEnvironmentId: "prenv_demo_42",
        resourceId: "res_preview_api",
      });
      const owner = await database.db
        .selectFrom("resources")
        .select(["id"])
        .where("id", "=", "res_preview_api")
        .executeTakeFirst();

      expect(deleted).toBeNull();
      expect(owner?.id).toBe("res_preview_api");
    } finally {
      await database.close();
      rmSync(dataDir, { force: true, recursive: true });
    }
  });
});
