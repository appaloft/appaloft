import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const deploymentSupersedeFencingMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE deployments
      ADD COLUMN IF NOT EXISTS superseded_by_deployment_id text REFERENCES deployments(id)
    `.execute(db);

    await sql`
      DROP INDEX IF EXISTS deployments_active_resource_unique
    `.execute(db);

    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS deployments_active_resource_unique
      ON deployments (resource_id)
      WHERE status IN ('created', 'planning', 'planned', 'running', 'cancel-requested')
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      DROP INDEX IF EXISTS deployments_active_resource_unique
    `.execute(db);

    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS deployments_active_resource_unique
      ON deployments (resource_id)
      WHERE status IN ('created', 'planning', 'planned', 'running')
    `.execute(db);

    await sql`
      ALTER TABLE deployments
      DROP COLUMN IF EXISTS superseded_by_deployment_id
    `.execute(db);
  },
};
