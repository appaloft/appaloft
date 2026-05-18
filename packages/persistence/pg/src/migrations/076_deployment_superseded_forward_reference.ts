import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const deploymentSupersededForwardReferenceMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE deployments
      DROP CONSTRAINT IF EXISTS deployments_superseded_by_deployment_id_fkey
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE deployments
      ADD CONSTRAINT deployments_superseded_by_deployment_id_fkey
      FOREIGN KEY (superseded_by_deployment_id) REFERENCES deployments(id)
    `.execute(db);
  },
};
