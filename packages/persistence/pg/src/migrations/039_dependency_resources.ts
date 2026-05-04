import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const dependencyResourcesMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS dependency_resources (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        environment_id TEXT NOT NULL,
        name TEXT NOT NULL,
        slug TEXT NOT NULL,
        kind TEXT NOT NULL,
        source_mode TEXT NOT NULL,
        provider_key TEXT NOT NULL,
        provider_managed BOOLEAN NOT NULL,
        description TEXT,
        endpoint JSONB,
        connection_secret_ref TEXT,
        backup_relationship JSONB,
        binding_readiness JSONB,
        lifecycle_status TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        deleted_at TIMESTAMPTZ
      )
    `.execute(db);

    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS dependency_resources_environment_slug_active_idx
      ON dependency_resources (project_id, environment_id, kind, slug)
      WHERE lifecycle_status != 'deleted'
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS dependency_resources_environment_idx
      ON dependency_resources (project_id, environment_id, kind)
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      DROP TABLE IF EXISTS dependency_resources
    `.execute(db);
  },
};
