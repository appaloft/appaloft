import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const certificatesMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS certificates (
        id text PRIMARY KEY,
        domain_binding_id text NOT NULL REFERENCES domain_bindings(id),
        domain_name text NOT NULL,
        status text NOT NULL,
        provider_key text NOT NULL,
        challenge_type text NOT NULL,
        issued_at timestamptz,
        expires_at timestamptz,
        fingerprint text,
        secret_ref text,
        attempts jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS certificates_domain_binding_id_idx
      ON certificates (domain_binding_id)
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      DROP INDEX IF EXISTS certificates_domain_binding_id_idx
    `.execute(db);

    await sql`
      DROP TABLE IF EXISTS certificates
    `.execute(db);
  },
};
