import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const domainBindingActiveCertificateMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE domain_bindings
      ADD COLUMN IF NOT EXISTS active_certificate_id text REFERENCES certificates(id),
      ADD COLUMN IF NOT EXISTS active_certificate_fingerprint text
    `.execute(db);
    await sql`
      UPDATE domain_bindings
      SET status = 'certificate_pending', route_failure = NULL
      WHERE tls_mode = 'auto'
        AND certificate_policy IN ('auto', 'manual')
        AND status = 'ready'
        AND active_certificate_id IS NULL
        AND active_certificate_fingerprint IS NULL
    `.execute(db);
    await sql`
      ALTER TABLE domain_bindings
      DROP CONSTRAINT IF EXISTS domain_bindings_active_certificate_proof_pair
    `.execute(db);
    await sql`
      ALTER TABLE domain_bindings
      ADD CONSTRAINT domain_bindings_active_certificate_proof_pair
      CHECK ((active_certificate_id IS NULL) = (active_certificate_fingerprint IS NULL))
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE domain_bindings
      DROP CONSTRAINT IF EXISTS domain_bindings_active_certificate_proof_pair,
      DROP COLUMN IF EXISTS active_certificate_fingerprint,
      DROP COLUMN IF EXISTS active_certificate_id
    `.execute(db);
  },
};
