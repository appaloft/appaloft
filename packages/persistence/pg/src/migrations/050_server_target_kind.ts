import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const serverTargetKindMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE servers
      ADD COLUMN IF NOT EXISTS target_kind text NOT NULL DEFAULT 'single-server'
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE servers
      DROP COLUMN IF EXISTS target_kind
    `.execute(db);
  },
};
