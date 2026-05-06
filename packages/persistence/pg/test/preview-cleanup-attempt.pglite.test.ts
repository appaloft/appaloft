import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createExecutionContext,
  type PreviewCleanupAttemptRecord,
  toRepositoryContext,
} from "@appaloft/application";
import { type Kysely } from "kysely";

import { type Database } from "../src";

async function seedPreviewCleanupOwners(db: Kysely<Database>) {
  await db
    .insertInto("projects")
    .values({
      id: "prj_preview_cleanup",
      name: "Preview Cleanup Project",
      slug: "preview-cleanup-project",
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
      id: "env_preview_cleanup",
      project_id: "prj_preview_cleanup",
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
      id: "srv_preview_cleanup",
      name: "Preview Cleanup Server",
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
      id: "dst_preview_cleanup",
      server_id: "srv_preview_cleanup",
      name: "default",
      kind: "generic",
      created_at: "2026-05-06T00:00:00.000Z",
    })
    .execute();

  await db
    .insertInto("resources")
    .values({
      id: "res_preview_cleanup_api",
      project_id: "prj_preview_cleanup",
      environment_id: "env_preview_cleanup",
      destination_id: "dst_preview_cleanup",
      name: "Preview Cleanup API",
      slug: "preview-cleanup-api",
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

  await db
    .insertInto("preview_environments")
    .values({
      id: "prenv_preview_cleanup_1",
      project_id: "prj_preview_cleanup",
      environment_id: "env_preview_cleanup",
      resource_id: "res_preview_cleanup_api",
      server_id: "srv_preview_cleanup",
      destination_id: "dst_preview_cleanup",
      provider: "github",
      repository_full_name: "appaloft/demo",
      head_repository_full_name: "appaloft/demo",
      pull_request_number: 42,
      head_sha: "abc1234",
      base_ref: "main",
      source_binding_fingerprint: "srcfp_preview_cleanup",
      status: "cleanup-requested",
      created_at: "2026-05-06T00:00:00.000Z",
      updated_at: "2026-05-06T00:05:00.000Z",
      expires_at: "2026-05-13T00:00:00.000Z",
    })
    .execute();
}

function contextFixture() {
  return toRepositoryContext(
    createExecutionContext({
      requestId: "req_preview_cleanup_attempt_pglite_test",
      entrypoint: "system",
    }),
  );
}

describe("preview cleanup attempt persistence", () => {
  test("[PG-PREVIEW-CLEANUP-002] records durable retry attempts with safe details", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-preview-cleanup-attempt-"));
    const { createDatabase, createMigrator, PgPreviewCleanupAttemptRecorder } = await import(
      "../src"
    );
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: dataDir,
    });

    try {
      const migrationResult = await createMigrator(database.db).migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      await seedPreviewCleanupOwners(database.db);
      const context = contextFixture();
      const recorder = new PgPreviewCleanupAttemptRecorder(database.db);
      const retryAttempt: PreviewCleanupAttemptRecord = {
        attemptId: "pcln_preview_cleanup_retry_1",
        previewEnvironmentId: "prenv_preview_cleanup_1",
        resourceId: "res_preview_cleanup_api",
        sourceBindingFingerprint: "srcfp_preview_cleanup",
        owner: "req_preview_cleanup_attempt_pglite_test",
        status: "retry-scheduled",
        phase: "provider-metadata-cleanup",
        attemptedAt: "2026-05-06T01:00:00.000Z",
        updatedAt: "2026-05-06T01:00:00.000Z",
        errorCode: "github_rate_limited",
        retryable: true,
        nextRetryAt: "2026-05-06T01:05:00.000Z",
      };
      const succeededAttempt: PreviewCleanupAttemptRecord = {
        attemptId: "pcln_preview_cleanup_retry_2",
        previewEnvironmentId: "prenv_preview_cleanup_1",
        resourceId: "res_preview_cleanup_api",
        sourceBindingFingerprint: "srcfp_preview_cleanup",
        owner: "req_preview_cleanup_attempt_pglite_test",
        status: "succeeded",
        phase: "preview-cleanup",
        attemptedAt: "2026-05-06T01:05:00.000Z",
        updatedAt: "2026-05-06T01:05:00.000Z",
      };

      await recorder.record(context, retryAttempt);
      await recorder.record(context, succeededAttempt);

      const rows = await database.db
        .selectFrom("preview_cleanup_attempts")
        .selectAll()
        .where("preview_environment_id", "=", "prenv_preview_cleanup_1")
        .orderBy("attempted_at", "asc")
        .execute();
      const normalizedRows = rows.map((row) => ({
        ...row,
        attempted_at: new Date(row.attempted_at).toISOString(),
        updated_at: new Date(row.updated_at).toISOString(),
        next_retry_at: row.next_retry_at ? new Date(row.next_retry_at).toISOString() : null,
      }));

      expect(normalizedRows).toEqual([
        {
          attempt_id: "pcln_preview_cleanup_retry_1",
          preview_environment_id: "prenv_preview_cleanup_1",
          resource_id: "res_preview_cleanup_api",
          source_binding_fingerprint: "srcfp_preview_cleanup",
          owner: "req_preview_cleanup_attempt_pglite_test",
          status: "retry-scheduled",
          phase: "provider-metadata-cleanup",
          attempted_at: "2026-05-06T01:00:00.000Z",
          updated_at: "2026-05-06T01:00:00.000Z",
          error_code: "github_rate_limited",
          retryable: true,
          next_retry_at: "2026-05-06T01:05:00.000Z",
        },
        {
          attempt_id: "pcln_preview_cleanup_retry_2",
          preview_environment_id: "prenv_preview_cleanup_1",
          resource_id: "res_preview_cleanup_api",
          source_binding_fingerprint: "srcfp_preview_cleanup",
          owner: "req_preview_cleanup_attempt_pglite_test",
          status: "succeeded",
          phase: "preview-cleanup",
          attempted_at: "2026-05-06T01:05:00.000Z",
          updated_at: "2026-05-06T01:05:00.000Z",
          error_code: null,
          retryable: null,
          next_retry_at: null,
        },
      ]);
      expect(JSON.stringify(normalizedRows)).not.toContain(
        "Provider metadata cleanup is temporarily unavailable",
      );
      expect(JSON.stringify(normalizedRows)).not.toContain("secret");
      expect(JSON.stringify(normalizedRows)).not.toContain("token");
    } finally {
      await database.close();
      rmSync(dataDir, { force: true, recursive: true });
    }
  });
});
