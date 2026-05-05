import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const deploymentRollbackMetadataMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE deployments
      ADD COLUMN IF NOT EXISTS rollback_candidate_deployment_id TEXT
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS deployments_rollback_candidate_idx
      ON deployments (rollback_candidate_deployment_id, created_at DESC)
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      DROP INDEX IF EXISTS deployments_rollback_candidate_idx
    `.execute(db);

    await sql`
      ALTER TABLE deployments
      DROP COLUMN IF EXISTS rollback_candidate_deployment_id
    `.execute(db);
  },
};
