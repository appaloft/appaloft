import { type Kysely, sql } from "kysely";

export const serverDeleteTombstoneMigration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await sql`
      ALTER TABLE servers
      ADD COLUMN IF NOT EXISTS deleted_at timestamptz
    `.execute(db);
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await sql`
      ALTER TABLE servers
      DROP COLUMN IF EXISTS deleted_at
    `.execute(db);
  },
};
