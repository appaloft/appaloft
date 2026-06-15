import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const deploymentTimelineJournalMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE deployments
      DROP COLUMN IF EXISTS logs
    `.execute(db);

    await sql`
      ALTER TABLE deployments
      ADD COLUMN IF NOT EXISTS timeline jsonb NOT NULL DEFAULT '[]'::jsonb
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE deployments
      DROP COLUMN IF EXISTS timeline
    `.execute(db);
  },
};
