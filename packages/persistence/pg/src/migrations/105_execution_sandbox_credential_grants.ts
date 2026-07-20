import { type Kysely, sql } from "kysely";

export const executionSandboxCredentialGrantsMigration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS execution_sandbox_credential_grants (
        tenant_id TEXT NOT NULL,
        sandbox_id TEXT NOT NULL,
        grant_id TEXT NOT NULL,
        state JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (tenant_id, sandbox_id, grant_id),
        FOREIGN KEY (tenant_id, sandbox_id)
          REFERENCES execution_sandboxes (tenant_id, id)
          ON DELETE CASCADE
      )
    `.execute(db);
    await sql`
      CREATE INDEX IF NOT EXISTS execution_sandbox_credential_grants_sandbox_idx
      ON execution_sandbox_credential_grants (tenant_id, sandbox_id, grant_id)
    `.execute(db);
  },
  async down(db: Kysely<unknown>): Promise<void> {
    await sql`DROP TABLE IF EXISTS execution_sandbox_credential_grants`.execute(db);
  },
};
