import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const dependencyResourceBackupsMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS dependency_resource_backups (
        id TEXT PRIMARY KEY,
        dependency_resource_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        environment_id TEXT NOT NULL,
        dependency_kind TEXT NOT NULL,
        provider_key TEXT NOT NULL,
        status TEXT NOT NULL,
        attempt_id TEXT NOT NULL,
        requested_at TIMESTAMPTZ NOT NULL,
        retention_status TEXT NOT NULL,
        provider_artifact_handle TEXT,
        completed_at TIMESTAMPTZ,
        failed_at TIMESTAMPTZ,
        failure_code TEXT,
        failure_message TEXT,
        latest_restore_attempt JSONB,
        created_at TIMESTAMPTZ NOT NULL
      )
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS dependency_resource_backups_resource_idx
      ON dependency_resource_backups (dependency_resource_id, created_at DESC)
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS dependency_resource_backups_delete_blocker_idx
      ON dependency_resource_backups (dependency_resource_id, status, retention_status)
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      DROP TABLE IF EXISTS dependency_resource_backups
    `.execute(db);
  },
};
