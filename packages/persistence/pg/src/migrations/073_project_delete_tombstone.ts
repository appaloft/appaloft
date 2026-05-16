import { type Kysely, sql } from "kysely";

export const projectDeleteTombstoneMigration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await sql`
      ALTER TABLE projects
      ADD COLUMN IF NOT EXISTS deleted_at timestamptz
    `.execute(db);
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await sql`
      ALTER TABLE projects
      DROP COLUMN IF EXISTS deleted_at
    `.execute(db);
  },
};
