import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const deployTokensMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS deploy_tokens (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        verifier_digest TEXT NOT NULL UNIQUE,
        secret_suffix TEXT NOT NULL,
        status TEXT NOT NULL,
        scope JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        expires_at TIMESTAMPTZ,
        last_used_at TIMESTAMPTZ,
        rotated_at TIMESTAMPTZ,
        revoked_at TIMESTAMPTZ
      )
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS deploy_tokens_organization_id_idx
      ON deploy_tokens (organization_id)
    `.execute(db);
    await sql`
      CREATE INDEX IF NOT EXISTS deploy_tokens_status_idx
      ON deploy_tokens (status)
    `.execute(db);
    await sql`
      CREATE INDEX IF NOT EXISTS deploy_tokens_active_verifier_idx
      ON deploy_tokens (verifier_digest)
      WHERE status = 'active'
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`DROP INDEX IF EXISTS deploy_tokens_active_verifier_idx`.execute(db);
    await sql`DROP INDEX IF EXISTS deploy_tokens_status_idx`.execute(db);
    await sql`DROP INDEX IF EXISTS deploy_tokens_organization_id_idx`.execute(db);
    await sql`DROP TABLE IF EXISTS deploy_tokens`.execute(db);
  },
};
