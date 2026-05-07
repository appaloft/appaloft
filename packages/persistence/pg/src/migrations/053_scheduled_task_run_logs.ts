import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const scheduledTaskRunLogsMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS scheduled_task_run_logs (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES scheduled_task_run_attempts(id),
        task_id TEXT NOT NULL,
        resource_id TEXT NOT NULL REFERENCES resources(id),
        logged_at TIMESTAMPTZ NOT NULL,
        stream TEXT NOT NULL,
        message TEXT NOT NULL
      )
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS scheduled_task_run_logs_run_logged_idx
      ON scheduled_task_run_logs (run_id, logged_at ASC)
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS scheduled_task_run_logs_task_idx
      ON scheduled_task_run_logs (task_id)
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS scheduled_task_run_logs_resource_idx
      ON scheduled_task_run_logs (resource_id)
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      DROP TABLE IF EXISTS scheduled_task_run_logs
    `.execute(db);
  },
};
