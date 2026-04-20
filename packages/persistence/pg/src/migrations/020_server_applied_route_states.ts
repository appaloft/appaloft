import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const serverAppliedRouteStatesMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS server_applied_route_states (
        route_set_id text PRIMARY KEY,
        project_id text NOT NULL REFERENCES projects(id),
        environment_id text NOT NULL REFERENCES environments(id),
        resource_id text NOT NULL REFERENCES resources(id),
        server_id text NOT NULL REFERENCES servers(id),
        destination_id text REFERENCES destinations(id),
        source_fingerprint text,
        domains jsonb NOT NULL,
        status text NOT NULL,
        updated_at timestamptz NOT NULL,
        last_applied jsonb,
        last_failure jsonb,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb
      )
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS server_applied_route_states_target_idx
      ON server_applied_route_states (
        project_id,
        environment_id,
        resource_id,
        server_id,
        destination_id
      )
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS server_applied_route_states_default_target_idx
      ON server_applied_route_states (
        project_id,
        environment_id,
        resource_id,
        server_id
      )
      WHERE destination_id IS NULL
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS server_applied_route_states_resource_id_idx
      ON server_applied_route_states (resource_id)
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS server_applied_route_states_server_id_idx
      ON server_applied_route_states (server_id)
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      DROP INDEX IF EXISTS server_applied_route_states_server_id_idx
    `.execute(db);

    await sql`
      DROP INDEX IF EXISTS server_applied_route_states_resource_id_idx
    `.execute(db);

    await sql`
      DROP INDEX IF EXISTS server_applied_route_states_default_target_idx
    `.execute(db);

    await sql`
      DROP INDEX IF EXISTS server_applied_route_states_target_idx
    `.execute(db);

    await sql`
      DROP TABLE IF EXISTS server_applied_route_states
    `.execute(db);
  },
};
