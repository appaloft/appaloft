import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const resourceDeleteTombstoneMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE resources
      ADD COLUMN IF NOT EXISTS deleted_at timestamptz
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE resources
      DROP COLUMN IF EXISTS deleted_at
    `.execute(db);
  },
};
