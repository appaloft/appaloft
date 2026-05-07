import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const dependencyBindingSecretRotationMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE resource_dependency_bindings
      ADD COLUMN IF NOT EXISTS secret_ref TEXT
    `.execute(db);

    await sql`
      ALTER TABLE resource_dependency_bindings
      ADD COLUMN IF NOT EXISTS secret_version TEXT
    `.execute(db);

    await sql`
      ALTER TABLE resource_dependency_bindings
      ADD COLUMN IF NOT EXISTS secret_rotated_at TIMESTAMPTZ
    `.execute(db);

    await sql`
      CREATE TABLE IF NOT EXISTS dependency_binding_secrets (
        ref TEXT PRIMARY KEY,
        binding_id TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        secret_version TEXT NOT NULL,
        payload JSONB NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL
      )
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS dependency_binding_secrets_binding_idx
      ON dependency_binding_secrets (binding_id, secret_version)
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      DROP TABLE IF EXISTS dependency_binding_secrets
    `.execute(db);

    await sql`
      ALTER TABLE resource_dependency_bindings
      DROP COLUMN IF EXISTS secret_rotated_at
    `.execute(db);

    await sql`
      ALTER TABLE resource_dependency_bindings
      DROP COLUMN IF EXISTS secret_version
    `.execute(db);

    await sql`
      ALTER TABLE resource_dependency_bindings
      DROP COLUMN IF EXISTS secret_ref
    `.execute(db);
  },
};
