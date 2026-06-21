import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const domainBindingPathHandlingMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE domain_bindings
      ADD COLUMN IF NOT EXISTS path_handling text NOT NULL DEFAULT 'preserve'
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE domain_bindings
      DROP COLUMN IF EXISTS path_handling
    `.execute(db);
  },
};
