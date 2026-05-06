import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const previewEnvironmentsMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS preview_environments (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        environment_id TEXT NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
        resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
        server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
        destination_id TEXT NOT NULL REFERENCES destinations(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        repository_full_name TEXT NOT NULL,
        head_repository_full_name TEXT NOT NULL,
        pull_request_number INTEGER NOT NULL,
        head_sha TEXT NOT NULL,
        base_ref TEXT NOT NULL,
        source_binding_fingerprint TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        expires_at TIMESTAMPTZ,
        CONSTRAINT preview_environments_scope_unique UNIQUE (
          provider,
          repository_full_name,
          pull_request_number,
          resource_id
        )
      )
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS preview_environments_project_updated_idx
      ON preview_environments (project_id, updated_at DESC)
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS preview_environments_resource_updated_idx
      ON preview_environments (resource_id, updated_at DESC)
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS preview_environments_status_idx
      ON preview_environments (status)
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      DROP INDEX IF EXISTS preview_environments_status_idx
    `.execute(db);

    await sql`
      DROP INDEX IF EXISTS preview_environments_resource_updated_idx
    `.execute(db);

    await sql`
      DROP INDEX IF EXISTS preview_environments_project_updated_idx
    `.execute(db);

    await sql`
      DROP TABLE IF EXISTS preview_environments
    `.execute(db);
  },
};
