import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const domainBindingDeletedStatusMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      DROP INDEX IF EXISTS domain_bindings_active_route_unique
    `.execute(db);

    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS domain_bindings_active_route_unique
      ON domain_bindings (project_id, environment_id, resource_id, domain_name, path_prefix)
      WHERE status NOT IN ('failed', 'deleted')
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      DROP INDEX IF EXISTS domain_bindings_active_route_unique
    `.execute(db);

    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS domain_bindings_active_route_unique
      ON domain_bindings (project_id, environment_id, resource_id, domain_name, path_prefix)
      WHERE status <> 'failed'
    `.execute(db);
  },
};
