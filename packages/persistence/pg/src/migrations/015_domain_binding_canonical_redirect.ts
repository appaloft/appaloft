import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const domainBindingCanonicalRedirectMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE domain_bindings
      ADD COLUMN IF NOT EXISTS redirect_to text,
      ADD COLUMN IF NOT EXISTS redirect_status integer
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE domain_bindings
      DROP COLUMN IF EXISTS redirect_status,
      DROP COLUMN IF EXISTS redirect_to
    `.execute(db);
  },
};
