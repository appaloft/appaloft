import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const previewFeedbackRecordsMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS preview_feedback_records (
        feedback_key TEXT PRIMARY KEY,
        source_event_id TEXT NOT NULL,
        preview_environment_id TEXT NOT NULL REFERENCES preview_environments(id) ON DELETE CASCADE,
        channel TEXT NOT NULL,
        status TEXT NOT NULL,
        provider_feedback_id TEXT,
        error_code TEXT,
        retryable BOOLEAN,
        updated_at TIMESTAMPTZ NOT NULL
      )
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS preview_feedback_records_environment_updated_idx
      ON preview_feedback_records (preview_environment_id, updated_at DESC)
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS preview_feedback_records_source_event_idx
      ON preview_feedback_records (source_event_id)
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS preview_feedback_records_status_idx
      ON preview_feedback_records (status)
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      DROP INDEX IF EXISTS preview_feedback_records_status_idx
    `.execute(db);

    await sql`
      DROP INDEX IF EXISTS preview_feedback_records_source_event_idx
    `.execute(db);

    await sql`
      DROP INDEX IF EXISTS preview_feedback_records_environment_updated_idx
    `.execute(db);

    await sql`
      DROP TABLE IF EXISTS preview_feedback_records
    `.execute(db);
  },
};
