import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const deploymentDependencyBindingReferencesMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE deployments
      ADD COLUMN IF NOT EXISTS dependency_binding_references JSONB NOT NULL DEFAULT '[]'::jsonb
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE deployments
      DROP COLUMN IF EXISTS dependency_binding_references
    `.execute(db);
  },
};
