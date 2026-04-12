import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const destinationBackfillMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS destinations (
        id text PRIMARY KEY,
        server_id text NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
        name text NOT NULL,
        kind text NOT NULL,
        created_at timestamptz NOT NULL,
        CONSTRAINT destinations_server_name_unique UNIQUE (server_id, name)
      )
    `.execute(db);

    await sql`
      CREATE TABLE IF NOT EXISTS resources (
        id text PRIMARY KEY,
        project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        environment_id text NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
        destination_id text REFERENCES destinations(id) ON DELETE SET NULL,
        name text NOT NULL,
        slug text NOT NULL,
        kind text NOT NULL,
        description text,
        services jsonb NOT NULL DEFAULT '[]',
        created_at timestamptz NOT NULL,
        CONSTRAINT resources_environment_slug_unique UNIQUE (project_id, environment_id, slug)
      )
    `.execute(db);

    await sql`
      ALTER TABLE resources
      ADD COLUMN IF NOT EXISTS destination_id text REFERENCES destinations(id) ON DELETE SET NULL
    `.execute(db);

    await sql`
      ALTER TABLE deployments
      ADD COLUMN IF NOT EXISTS resource_id text REFERENCES resources(id) ON DELETE CASCADE
    `.execute(db);

    await sql`
      ALTER TABLE deployments
      ADD COLUMN IF NOT EXISTS destination_id text REFERENCES destinations(id) ON DELETE CASCADE
    `.execute(db);

    await sql`
      INSERT INTO destinations (id, server_id, name, kind, created_at)
      SELECT 'dst_legacy_' || id, id, 'default', 'generic', created_at
      FROM servers
      WHERE NOT EXISTS (
        SELECT 1
        FROM destinations
        WHERE destinations.server_id = servers.id
          AND destinations.name = 'default'
      )
    `.execute(db);

    await sql`
      UPDATE resources
      SET destination_id = destinations.id
      FROM destinations
      WHERE resources.destination_id IS NULL
        AND destinations.name = 'default'
        AND destinations.server_id = (
          SELECT deployments.server_id
          FROM deployments
          WHERE deployments.resource_id = resources.id
          ORDER BY deployments.created_at DESC
          LIMIT 1
        )
    `.execute(db);

    await sql`
      UPDATE deployments
      SET destination_id = destinations.id
      FROM destinations
      WHERE deployments.destination_id IS NULL
        AND destinations.server_id = deployments.server_id
        AND destinations.name = 'default'
    `.execute(db);

    await sql`
      ALTER TABLE deployments
      ALTER COLUMN destination_id SET NOT NULL
    `.execute(db);
  },

  async down(_db: Kysely<Database>): Promise<void> {
    void _db;
  },
};
