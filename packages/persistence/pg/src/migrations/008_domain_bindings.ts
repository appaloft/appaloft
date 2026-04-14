import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const domainBindingsMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS domain_bindings (
        id text PRIMARY KEY,
        project_id text NOT NULL REFERENCES projects(id),
        environment_id text NOT NULL REFERENCES environments(id),
        resource_id text NOT NULL REFERENCES resources(id),
        server_id text NOT NULL REFERENCES servers(id),
        destination_id text NOT NULL REFERENCES destinations(id),
        domain_name text NOT NULL,
        path_prefix text NOT NULL,
        proxy_kind text NOT NULL,
        tls_mode text NOT NULL,
        certificate_policy text NOT NULL,
        status text NOT NULL,
        verification_attempts jsonb NOT NULL DEFAULT '[]'::jsonb,
        idempotency_key text,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `.execute(db);

    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS domain_bindings_active_route_unique
      ON domain_bindings (project_id, environment_id, resource_id, domain_name, path_prefix)
      WHERE status <> 'failed'
    `.execute(db);

    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS domain_bindings_idempotency_key_unique
      ON domain_bindings (idempotency_key)
      WHERE idempotency_key IS NOT NULL
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      DROP INDEX IF EXISTS domain_bindings_idempotency_key_unique
    `.execute(db);

    await sql`
      DROP INDEX IF EXISTS domain_bindings_active_route_unique
    `.execute(db);

    await sql`
      DROP TABLE IF EXISTS domain_bindings
    `.execute(db);
  },
};
