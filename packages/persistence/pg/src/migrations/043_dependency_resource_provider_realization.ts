import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const dependencyResourceProviderRealizationMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE dependency_resources
      ADD COLUMN IF NOT EXISTS provider_realization JSONB
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE dependency_resources
      DROP COLUMN IF EXISTS provider_realization
    `.execute(db);
  },
};
