import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const resourceDependencyBindingsMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS resource_dependency_bindings (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        environment_id TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        dependency_resource_id TEXT NOT NULL,
        target_name TEXT NOT NULL,
        scope TEXT NOT NULL,
        injection_mode TEXT NOT NULL,
        lifecycle_status TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        removed_at TIMESTAMPTZ
      )
    `.execute(db);

    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS resource_dependency_bindings_active_target_idx
      ON resource_dependency_bindings (resource_id, dependency_resource_id, target_name)
      WHERE lifecycle_status = 'active'
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS resource_dependency_bindings_resource_idx
      ON resource_dependency_bindings (resource_id, lifecycle_status)
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS resource_dependency_bindings_dependency_resource_idx
      ON resource_dependency_bindings (dependency_resource_id, lifecycle_status)
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      DROP TABLE IF EXISTS resource_dependency_bindings
    `.execute(db);
  },
};
