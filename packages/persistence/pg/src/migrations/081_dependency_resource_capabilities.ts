import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const dependencyResourceCapabilitiesMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE dependency_resources
      ADD COLUMN IF NOT EXISTS desired_capabilities JSONB
    `.execute(db);

    await sql`
      ALTER TABLE dependency_resources
      ADD COLUMN IF NOT EXISTS capability_readbacks JSONB
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE dependency_resources
      DROP COLUMN IF EXISTS capability_readbacks
    `.execute(db);

    await sql`
      ALTER TABLE dependency_resources
      DROP COLUMN IF EXISTS desired_capabilities
    `.execute(db);
  },
};
