import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const deploymentRecoveryMetadataMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE deployments
      ADD COLUMN IF NOT EXISTS trigger_kind TEXT NOT NULL DEFAULT 'create'
    `.execute(db);

    await sql`
      ALTER TABLE deployments
      ADD COLUMN IF NOT EXISTS source_deployment_id TEXT
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS deployments_recovery_source_idx
      ON deployments (source_deployment_id, created_at DESC)
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      DROP INDEX IF EXISTS deployments_recovery_source_idx
    `.execute(db);

    await sql`
      ALTER TABLE deployments
      DROP COLUMN IF EXISTS source_deployment_id
    `.execute(db);

    await sql`
      ALTER TABLE deployments
      DROP COLUMN IF EXISTS trigger_kind
    `.execute(db);
  },
};
