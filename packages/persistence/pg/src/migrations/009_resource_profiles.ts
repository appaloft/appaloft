import { type Kysely, sql } from "kysely";

export const resourceProfilesMigration = {
  async up(db: Kysely<unknown>) {
    await sql`
      ALTER TABLE resources
      ADD COLUMN IF NOT EXISTS source_binding jsonb,
      ADD COLUMN IF NOT EXISTS runtime_profile jsonb
    `.execute(db);
  },

  async down(db: Kysely<unknown>) {
    await sql`
      ALTER TABLE resources
      DROP COLUMN IF EXISTS runtime_profile,
      DROP COLUMN IF EXISTS source_binding
    `.execute(db);
  },
};
