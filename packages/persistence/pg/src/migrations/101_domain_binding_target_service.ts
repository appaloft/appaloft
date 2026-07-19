import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const domainBindingTargetServiceMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE domain_bindings
      ADD COLUMN IF NOT EXISTS target_service_name text
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE domain_bindings
      DROP COLUMN IF EXISTS target_service_name
    `.execute(db);
  },
};
