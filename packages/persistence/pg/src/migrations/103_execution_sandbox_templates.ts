import { type Kysely, sql } from "kysely";
import { type Database } from "../schema";

export const executionSandboxTemplatesMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS execution_sandbox_templates (
        tenant_id TEXT NOT NULL,
        id TEXT NOT NULL,
        name TEXT NOT NULL,
        state JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (tenant_id, id)
      )
    `.execute(db);
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS execution_sandbox_templates_tenant_name_idx
      ON execution_sandbox_templates (tenant_id, name)
    `.execute(db);
  },
  async down(db: Kysely<Database>): Promise<void> {
    await sql`DROP TABLE IF EXISTS execution_sandbox_templates`.execute(db);
  },
};
