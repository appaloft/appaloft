import { type Kysely, sql } from "kysely";
import { type Database } from "../schema";

export const workspaceCollaborationsMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`CREATE TABLE IF NOT EXISTS workspace_collaborations (
      tenant_id TEXT NOT NULL,
      id TEXT NOT NULL,
      status TEXT NOT NULL,
      revision INTEGER NOT NULL,
      state JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (tenant_id, id)
    )`.execute(db);
    await sql`CREATE INDEX IF NOT EXISTS workspace_collaborations_tenant_status_idx
      ON workspace_collaborations (tenant_id, status, updated_at DESC)`.execute(db);
  },
  async down(db: Kysely<Database>): Promise<void> {
    await sql`DROP TABLE IF EXISTS workspace_collaborations`.execute(db);
  },
};
