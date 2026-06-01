import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const memberLifecycleStatusMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE member
      ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE member
      DROP COLUMN IF EXISTS status
    `.execute(db);
  },
};
