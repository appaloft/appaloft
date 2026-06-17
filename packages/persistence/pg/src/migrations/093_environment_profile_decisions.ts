import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const environmentProfileDecisionsMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS environment_profile_decisions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        environment_id TEXT NOT NULL,
        resource_id TEXT,
        kind TEXT NOT NULL,
        source_id TEXT NOT NULL,
        source_environment_id TEXT,
        source_resource_id TEXT,
        decision TEXT,
        reason TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        resolved_at TIMESTAMPTZ
      )
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS environment_profile_decisions_pending_environment_idx
      ON environment_profile_decisions (environment_id, status)
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS environment_profile_decisions_pending_resource_idx
      ON environment_profile_decisions (resource_id, status)
      WHERE resource_id IS NOT NULL
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      DROP TABLE IF EXISTS environment_profile_decisions
    `.execute(db);
  },
};
