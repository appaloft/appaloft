import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const scheduledTaskRunAttemptsMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS scheduled_task_run_attempts (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        resource_id TEXT NOT NULL REFERENCES resources(id),
        trigger_kind TEXT NOT NULL,
        status TEXT NOT NULL,
        scheduled_for TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL,
        started_at TIMESTAMPTZ,
        finished_at TIMESTAMPTZ,
        exit_code INTEGER,
        failure_summary TEXT,
        skipped_reason TEXT
      )
    `.execute(db);

    await sql`
      ALTER TABLE scheduled_task_run_attempts
      ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ
    `.execute(db);

    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS scheduled_task_run_attempts_scheduled_for_unique
      ON scheduled_task_run_attempts (task_id, scheduled_for)
      WHERE trigger_kind = 'scheduled' AND scheduled_for IS NOT NULL
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS scheduled_task_run_attempts_task_created_idx
      ON scheduled_task_run_attempts (task_id, created_at DESC)
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS scheduled_task_run_attempts_resource_created_idx
      ON scheduled_task_run_attempts (resource_id, created_at DESC)
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS scheduled_task_run_attempts_status_idx
      ON scheduled_task_run_attempts (status)
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS scheduled_task_run_attempts_trigger_kind_idx
      ON scheduled_task_run_attempts (trigger_kind)
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      DROP TABLE IF EXISTS scheduled_task_run_attempts
    `.execute(db);
  },
};
