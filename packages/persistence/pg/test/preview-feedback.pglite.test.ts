import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createExecutionContext,
  type PreviewFeedbackRecord,
  toRepositoryContext,
} from "@appaloft/application";
import { type Kysely } from "kysely";

import { type Database } from "../src";

async function seedPreviewFeedbackOwners(db: Kysely<Database>) {
  await db
    .insertInto("projects")
    .values({
      id: "prj_preview_feedback",
      name: "Preview Feedback Project",
      slug: "preview-feedback-project",
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
      id: "env_preview_feedback",
      project_id: "prj_preview_feedback",
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
      id: "srv_preview_feedback",
      name: "Preview Feedback Server",
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
      id: "dst_preview_feedback",
      server_id: "srv_preview_feedback",
      name: "default",
      kind: "generic",
      created_at: "2026-05-06T00:00:00.000Z",
    })
    .execute();

  await db
    .insertInto("resources")
    .values({
      id: "res_preview_feedback_api",
      project_id: "prj_preview_feedback",
      environment_id: "env_preview_feedback",
      destination_id: "dst_preview_feedback",
      name: "Preview Feedback API",
      slug: "preview-feedback-api",
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
      id: "prenv_preview_feedback_1",
      project_id: "prj_preview_feedback",
      environment_id: "env_preview_feedback",
      resource_id: "res_preview_feedback_api",
      server_id: "srv_preview_feedback",
      destination_id: "dst_preview_feedback",
      provider: "github",
      repository_full_name: "appaloft/demo",
      head_repository_full_name: "appaloft/demo",
      pull_request_number: 42,
      head_sha: "abc1234",
      base_ref: "main",
      source_binding_fingerprint: "srcfp_preview_feedback",
      status: "active",
      created_at: "2026-05-06T00:00:00.000Z",
      updated_at: "2026-05-06T00:00:00.000Z",
      expires_at: "2026-05-13T00:00:00.000Z",
    })
    .execute();
}

function contextFixture() {
  return toRepositoryContext(
    createExecutionContext({
      requestId: "req_preview_feedback_pglite_test",
      entrypoint: "system",
    }),
  );
}

describe("preview feedback persistence", () => {
  test("[PG-PREVIEW-FEEDBACK-001] records idempotent provider feedback state safely", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-preview-feedback-"));
    const { createDatabase, createMigrator, PgPreviewFeedbackRecorder } = await import("../src");
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: dataDir,
    });

    try {
      const migrationResult = await createMigrator(database.db).migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      await seedPreviewFeedbackOwners(database.db);
      const context = contextFixture();
      const recorder = new PgPreviewFeedbackRecorder(database.db);
      const published: PreviewFeedbackRecord = {
        feedbackKey: "feedback:sevt_preview_feedback_1:github-pr-comment",
        sourceEventId: "sevt_preview_feedback_1",
        previewEnvironmentId: "prenv_preview_feedback_1",
        channel: "github-pr-comment",
        status: "published",
        providerFeedbackId: "github_comment_100",
        updatedAt: "2026-05-06T01:00:00.000Z",
      };

      await recorder.record(context, published);

      expect(
        await recorder.findOne(context, {
          feedbackKey: "feedback:sevt_preview_feedback_1:github-pr-comment",
        }),
      ).toEqual(published);

      const retryableFailure: PreviewFeedbackRecord = {
        ...published,
        status: "retryable-failed",
        errorCode: "github_rate_limited",
        retryable: true,
        updatedAt: "2026-05-06T01:05:00.000Z",
      };

      await recorder.record(context, retryableFailure);

      const readback = await recorder.findOne(context, {
        feedbackKey: "feedback:sevt_preview_feedback_1:github-pr-comment",
      });

      expect(readback).toEqual(retryableFailure);
      expect(JSON.stringify(readback)).not.toContain("Preview feedback body");
      expect(JSON.stringify(readback)).not.toContain("secret");
      expect(JSON.stringify(readback)).not.toContain("token");
    } finally {
      await database.close();
      rmSync(dataDir, { force: true, recursive: true });
    }
  });
});
