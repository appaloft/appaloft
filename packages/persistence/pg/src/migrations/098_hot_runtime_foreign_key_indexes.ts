import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const hotRuntimeForeignKeyIndexesMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      CREATE INDEX IF NOT EXISTS resources_destination_id_fkey_idx
      ON resources (destination_id)
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS resources_environment_id_fkey_idx
      ON resources (environment_id)
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS servers_credential_id_fkey_idx
      ON servers (credential_id)
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS environments_parent_environment_id_fkey_idx
      ON environments (parent_environment_id)
    `.execute(db);

    await sql`DROP INDEX IF EXISTS organization_slug_uidx`.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS organization_slug_uidx
      ON organization (slug)
    `.execute(db);

    await sql`DROP INDEX IF EXISTS environments_parent_environment_id_fkey_idx`.execute(db);
    await sql`DROP INDEX IF EXISTS servers_credential_id_fkey_idx`.execute(db);
    await sql`DROP INDEX IF EXISTS resources_environment_id_fkey_idx`.execute(db);
    await sql`DROP INDEX IF EXISTS resources_destination_id_fkey_idx`.execute(db);
  },
};
