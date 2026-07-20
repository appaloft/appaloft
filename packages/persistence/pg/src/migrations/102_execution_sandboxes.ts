import { type Kysely, sql } from "kysely";
import { type Database } from "../schema";

export const executionSandboxesMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS execution_sandboxes (
        tenant_id TEXT NOT NULL,
        id TEXT NOT NULL,
        provider_key TEXT NOT NULL,
        status TEXT NOT NULL,
        requested_isolation TEXT NOT NULL,
        expires_at TIMESTAMPTZ,
        state JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (tenant_id, id)
      )
    `.execute(db);
    await sql`
      CREATE INDEX IF NOT EXISTS execution_sandboxes_tenant_status_idx
      ON execution_sandboxes (tenant_id, status, updated_at DESC)
    `.execute(db);
    await sql`
      CREATE TABLE IF NOT EXISTS execution_sandbox_snapshots (
        tenant_id TEXT NOT NULL,
        id TEXT NOT NULL,
        source_sandbox_id TEXT NOT NULL,
        provider_key TEXT NOT NULL,
        status TEXT NOT NULL,
        expires_at TIMESTAMPTZ,
        state JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (tenant_id, id),
        FOREIGN KEY (tenant_id, source_sandbox_id)
          REFERENCES execution_sandboxes (tenant_id, id) ON DELETE RESTRICT
      )
    `.execute(db);
    await sql`
      CREATE INDEX IF NOT EXISTS execution_sandbox_snapshots_tenant_source_idx
      ON execution_sandbox_snapshots (tenant_id, source_sandbox_id, created_at DESC)
    `.execute(db);
  },
  async down(db: Kysely<Database>): Promise<void> {
    await sql`DROP TABLE IF EXISTS execution_sandbox_snapshots`.execute(db);
    await sql`DROP TABLE IF EXISTS execution_sandboxes`.execute(db);
  },
};
