import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const deploymentAdmissionAndSupersedeMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE deployments
      ADD COLUMN IF NOT EXISTS supersedes_deployment_id text REFERENCES deployments(id)
    `.execute(db);

    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS deployments_active_resource_unique
      ON deployments (resource_id)
      WHERE status IN ('created', 'planning', 'planned', 'running')
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      DROP INDEX IF EXISTS deployments_active_resource_unique
    `.execute(db);

    await sql`
      ALTER TABLE deployments
      DROP COLUMN IF EXISTS supersedes_deployment_id
    `.execute(db);
  },
};
