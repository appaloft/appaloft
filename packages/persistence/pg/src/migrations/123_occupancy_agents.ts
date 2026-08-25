import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const occupancyAgentsMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`CREATE TABLE IF NOT EXISTS occupancy_agents (
      tenant_id TEXT NOT NULL,
      id TEXT NOT NULL,
      name TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      repository_identity TEXT NOT NULL,
      branch TEXT NOT NULL,
      sandbox_id TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (tenant_id, id)
    )`.execute(db);
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS occupancy_agents_active_key_idx
      ON occupancy_agents (
        tenant_id,
        subject_id,
        project_id,
        repository_identity,
        branch
      )
      WHERE status = 'active'`.execute(db);
    await sql`CREATE INDEX IF NOT EXISTS occupancy_agents_sandbox_idx
      ON occupancy_agents (tenant_id, sandbox_id)`.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`DROP TABLE IF EXISTS occupancy_agents`.execute(db);
  },
};
