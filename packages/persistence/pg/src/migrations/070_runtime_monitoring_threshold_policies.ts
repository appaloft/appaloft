import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const runtimeMonitoringThresholdPoliciesMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS runtime_monitoring_threshold_policies (
        id TEXT PRIMARY KEY,
        scope_kind TEXT NOT NULL,
        scope_id TEXT NOT NULL,
        rules JSONB NOT NULL,
        enabled BOOLEAN NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        updated_by_actor_id TEXT,
        updated_by_actor_kind TEXT,
        UNIQUE (scope_kind, scope_id)
      )
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS runtime_monitoring_threshold_policies_scope_idx
      ON runtime_monitoring_threshold_policies (scope_kind, scope_id)
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`DROP INDEX IF EXISTS runtime_monitoring_threshold_policies_scope_idx`.execute(db);
    await sql`DROP TABLE IF EXISTS runtime_monitoring_threshold_policies`.execute(db);
  },
};
