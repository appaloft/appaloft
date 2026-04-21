import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const certificateSecretsMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS certificate_secrets (
        ref text PRIMARY KEY,
        certificate_id text NOT NULL,
        domain_binding_id text NOT NULL,
        attempt_id text NOT NULL,
        source text NOT NULL,
        kind text NOT NULL,
        payload jsonb NOT NULL,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL
      )
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS certificate_secrets_certificate_id_idx
      ON certificate_secrets (certificate_id)
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS certificate_secrets_domain_binding_id_idx
      ON certificate_secrets (domain_binding_id)
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS certificate_secrets_attempt_id_idx
      ON certificate_secrets (attempt_id)
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      DROP INDEX IF EXISTS certificate_secrets_attempt_id_idx
    `.execute(db);

    await sql`
      DROP INDEX IF EXISTS certificate_secrets_domain_binding_id_idx
    `.execute(db);

    await sql`
      DROP INDEX IF EXISTS certificate_secrets_certificate_id_idx
    `.execute(db);

    await sql`
      DROP TABLE IF EXISTS certificate_secrets
    `.execute(db);
  },
};
