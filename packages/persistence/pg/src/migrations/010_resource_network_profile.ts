import { type Kysely, sql } from "kysely";

export const resourceNetworkProfileMigration = {
  async up(db: Kysely<unknown>) {
    await sql`
      ALTER TABLE resources
      ADD COLUMN IF NOT EXISTS network_profile jsonb
    `.execute(db);
  },

  async down(db: Kysely<unknown>) {
    await sql`
      ALTER TABLE resources
      DROP COLUMN IF EXISTS network_profile
    `.execute(db);
  },
};
