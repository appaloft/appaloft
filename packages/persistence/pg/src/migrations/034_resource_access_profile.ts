import { type Kysely, sql } from "kysely";

export const resourceAccessProfileMigration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await sql`
      ALTER TABLE resources
      ADD COLUMN IF NOT EXISTS access_profile jsonb
    `.execute(db);
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await sql`
      ALTER TABLE resources
      DROP COLUMN IF EXISTS access_profile
    `.execute(db);
  },
};
