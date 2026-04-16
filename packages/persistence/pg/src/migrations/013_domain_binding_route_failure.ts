import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const domainBindingRouteFailureMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE domain_bindings
      ADD COLUMN IF NOT EXISTS route_failure jsonb
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE domain_bindings
      DROP COLUMN IF EXISTS route_failure
    `.execute(db);
  },
};
