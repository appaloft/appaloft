import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const domainBindingActiveCertificateMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE domain_bindings
      ADD COLUMN IF NOT EXISTS active_certificate_id text REFERENCES certificates(id),
      ADD COLUMN IF NOT EXISTS active_certificate_fingerprint text
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE domain_bindings
      DROP COLUMN IF EXISTS active_certificate_fingerprint,
      DROP COLUMN IF EXISTS active_certificate_id
    `.execute(db);
  },
};
