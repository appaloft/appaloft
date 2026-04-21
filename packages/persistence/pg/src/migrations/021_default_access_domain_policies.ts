import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const defaultAccessDomainPoliciesMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS default_access_domain_policies (
        id text PRIMARY KEY,
        scope_key text NOT NULL UNIQUE,
        scope_kind text NOT NULL,
        server_id text REFERENCES servers(id),
        mode text NOT NULL,
        provider_key text,
        template_ref text,
        last_idempotency_key text,
        updated_at timestamptz NOT NULL
      )
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS default_access_domain_policies_server_id_idx
      ON default_access_domain_policies (server_id)
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      DROP INDEX IF EXISTS default_access_domain_policies_server_id_idx
    `.execute(db);

    await sql`
      DROP TABLE IF EXISTS default_access_domain_policies
    `.execute(db);
  },
};
