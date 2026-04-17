import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const domainBindingDnsObservationMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE domain_bindings
      ADD COLUMN IF NOT EXISTS dns_observation jsonb
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE domain_bindings
      DROP COLUMN IF EXISTS dns_observation
    `.execute(db);
  },
};
