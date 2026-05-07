import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const dependencyResourceSecretsMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS dependency_resource_secrets (
        ref TEXT PRIMARY KEY,
        dependency_resource_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        environment_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        purpose TEXT NOT NULL,
        payload JSONB NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL
      )
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS dependency_resource_secrets_resource_idx
      ON dependency_resource_secrets (dependency_resource_id, purpose)
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      DROP TABLE IF EXISTS dependency_resource_secrets
    `.execute(db);
  },
};
