import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const sourceLinksMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS source_links (
        source_fingerprint text PRIMARY KEY,
        project_id text NOT NULL REFERENCES projects(id),
        environment_id text NOT NULL REFERENCES environments(id),
        resource_id text NOT NULL REFERENCES resources(id),
        server_id text REFERENCES servers(id),
        destination_id text REFERENCES destinations(id),
        updated_at timestamptz NOT NULL,
        reason text,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb
      )
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS source_links_resource_id_idx
      ON source_links (resource_id)
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      DROP INDEX IF EXISTS source_links_resource_id_idx
    `.execute(db);

    await sql`
      DROP TABLE IF EXISTS source_links
    `.execute(db);
  },
};
