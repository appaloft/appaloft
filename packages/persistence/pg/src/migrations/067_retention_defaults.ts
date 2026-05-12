import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const retentionDefaultsMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS retention_defaults (
        id TEXT PRIMARY KEY,
        scope TEXT NOT NULL,
        organization_id TEXT,
        category TEXT NOT NULL,
        retention_days INTEGER NOT NULL,
        dry_run_scheduling_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        destructive_scheduling_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        updated_at TIMESTAMPTZ NOT NULL,
        updated_by_actor_id TEXT,
        updated_by_actor_kind TEXT
      )
    `.execute(db);

    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS retention_defaults_scope_category_idx
      ON retention_defaults (scope, COALESCE(organization_id, ''), category)
    `.execute(db);
    await sql`
      CREATE INDEX IF NOT EXISTS retention_defaults_enabled_idx
      ON retention_defaults (enabled, category)
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`DROP INDEX IF EXISTS retention_defaults_enabled_idx`.execute(db);
    await sql`DROP INDEX IF EXISTS retention_defaults_scope_category_idx`.execute(db);
    await sql`DROP TABLE IF EXISTS retention_defaults`.execute(db);
  },
};
