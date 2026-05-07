import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const previewPoliciesMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS preview_policies (
        id TEXT PRIMARY KEY,
        scope_kind TEXT NOT NULL,
        scope_key TEXT NOT NULL UNIQUE,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        resource_id TEXT REFERENCES resources(id) ON DELETE CASCADE,
        same_repository_previews BOOLEAN NOT NULL,
        fork_previews TEXT NOT NULL,
        secret_backed_previews BOOLEAN NOT NULL,
        last_idempotency_key TEXT,
        updated_at TIMESTAMPTZ NOT NULL,
        CONSTRAINT preview_policies_resource_scope_requires_resource
          CHECK (
            (scope_kind = 'resource' AND resource_id IS NOT NULL)
            OR (scope_kind = 'project' AND resource_id IS NULL)
          )
      )
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS preview_policies_project_idx
      ON preview_policies (project_id, updated_at DESC)
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS preview_policies_resource_idx
      ON preview_policies (resource_id, updated_at DESC)
      WHERE resource_id IS NOT NULL
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      DROP INDEX IF EXISTS preview_policies_resource_idx
    `.execute(db);

    await sql`
      DROP INDEX IF EXISTS preview_policies_project_idx
    `.execute(db);

    await sql`
      DROP TABLE IF EXISTS preview_policies
    `.execute(db);
  },
};
