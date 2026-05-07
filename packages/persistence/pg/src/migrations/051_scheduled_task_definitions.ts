import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const scheduledTaskDefinitionsMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS scheduled_task_definitions (
        id TEXT PRIMARY KEY,
        resource_id TEXT NOT NULL REFERENCES resources(id),
        schedule TEXT NOT NULL,
        timezone TEXT NOT NULL,
        command_intent TEXT NOT NULL,
        timeout_seconds INTEGER NOT NULL,
        retry_limit INTEGER NOT NULL,
        concurrency_policy TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      )
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS scheduled_task_definitions_resource_idx
      ON scheduled_task_definitions (resource_id)
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS scheduled_task_definitions_status_idx
      ON scheduled_task_definitions (status)
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS scheduled_task_definitions_created_idx
      ON scheduled_task_definitions (created_at DESC)
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      DROP TABLE IF EXISTS scheduled_task_definitions
    `.execute(db);
  },
};
