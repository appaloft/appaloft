import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const previewCleanupAttemptsMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS preview_cleanup_attempts (
        attempt_id TEXT PRIMARY KEY,
        preview_environment_id TEXT NOT NULL REFERENCES preview_environments(id) ON DELETE CASCADE,
        resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
        source_binding_fingerprint TEXT NOT NULL,
        owner TEXT NOT NULL,
        status TEXT NOT NULL,
        phase TEXT NOT NULL,
        attempted_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        error_code TEXT,
        retryable BOOLEAN,
        next_retry_at TIMESTAMPTZ
      )
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS preview_cleanup_attempts_environment_attempted_idx
      ON preview_cleanup_attempts (preview_environment_id, attempted_at DESC)
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS preview_cleanup_attempts_resource_status_idx
      ON preview_cleanup_attempts (resource_id, status)
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS preview_cleanup_attempts_next_retry_idx
      ON preview_cleanup_attempts (next_retry_at)
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      DROP INDEX IF EXISTS preview_cleanup_attempts_next_retry_idx
    `.execute(db);

    await sql`
      DROP INDEX IF EXISTS preview_cleanup_attempts_resource_status_idx
    `.execute(db);

    await sql`
      DROP INDEX IF EXISTS preview_cleanup_attempts_environment_attempted_idx
    `.execute(db);

    await sql`
      DROP TABLE IF EXISTS preview_cleanup_attempts
    `.execute(db);
  },
};
