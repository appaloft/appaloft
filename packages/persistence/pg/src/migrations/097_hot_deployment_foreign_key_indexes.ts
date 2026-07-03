import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const hotDeploymentForeignKeyIndexesMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      CREATE INDEX IF NOT EXISTS deployments_project_id_fkey_idx
      ON deployments (project_id)
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS deployments_environment_id_fkey_idx
      ON deployments (environment_id)
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS deployments_server_id_fkey_idx
      ON deployments (server_id)
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS deployments_destination_id_fkey_idx
      ON deployments (destination_id)
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS deployments_rollback_of_deployment_id_fkey_idx
      ON deployments (rollback_of_deployment_id)
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS deployments_supersedes_deployment_id_fkey_idx
      ON deployments (supersedes_deployment_id)
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS domain_bindings_environment_id_fkey_idx
      ON domain_bindings (environment_id)
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS domain_bindings_resource_id_fkey_idx
      ON domain_bindings (resource_id)
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS domain_bindings_server_id_fkey_idx
      ON domain_bindings (server_id)
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS domain_bindings_destination_id_fkey_idx
      ON domain_bindings (destination_id)
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`DROP INDEX IF EXISTS domain_bindings_destination_id_fkey_idx`.execute(db);
    await sql`DROP INDEX IF EXISTS domain_bindings_server_id_fkey_idx`.execute(db);
    await sql`DROP INDEX IF EXISTS domain_bindings_resource_id_fkey_idx`.execute(db);
    await sql`DROP INDEX IF EXISTS domain_bindings_environment_id_fkey_idx`.execute(db);
    await sql`DROP INDEX IF EXISTS deployments_supersedes_deployment_id_fkey_idx`.execute(db);
    await sql`DROP INDEX IF EXISTS deployments_rollback_of_deployment_id_fkey_idx`.execute(db);
    await sql`DROP INDEX IF EXISTS deployments_destination_id_fkey_idx`.execute(db);
    await sql`DROP INDEX IF EXISTS deployments_server_id_fkey_idx`.execute(db);
    await sql`DROP INDEX IF EXISTS deployments_environment_id_fkey_idx`.execute(db);
    await sql`DROP INDEX IF EXISTS deployments_project_id_fkey_idx`.execute(db);
  },
};
