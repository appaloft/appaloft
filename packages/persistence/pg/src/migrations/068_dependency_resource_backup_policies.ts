import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const dependencyResourceBackupPoliciesMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS dependency_resource_backup_policies (
        id TEXT PRIMARY KEY,
        version TEXT NOT NULL,
        dependency_resource_id TEXT NOT NULL,
        retention_days INTEGER NOT NULL,
        schedule_interval_hours INTEGER NOT NULL,
        provider_key TEXT,
        retry_on_failure BOOLEAN NOT NULL DEFAULT TRUE,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        last_run_at TIMESTAMPTZ,
        next_run_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      )
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS dependency_resource_backup_policies_resource_idx
      ON dependency_resource_backup_policies (dependency_resource_id, enabled)
    `.execute(db);
    await sql`
      CREATE INDEX IF NOT EXISTS dependency_resource_backup_policies_due_idx
      ON dependency_resource_backup_policies (enabled, next_run_at)
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`DROP INDEX IF EXISTS dependency_resource_backup_policies_due_idx`.execute(db);
    await sql`DROP INDEX IF EXISTS dependency_resource_backup_policies_resource_idx`.execute(db);
    await sql`DROP TABLE IF EXISTS dependency_resource_backup_policies`.execute(db);
  },
};
