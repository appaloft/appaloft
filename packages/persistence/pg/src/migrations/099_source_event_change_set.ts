import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const sourceEventChangeSetMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE source_events
      ADD COLUMN IF NOT EXISTS change_set jsonb NOT NULL
      DEFAULT '{"status":"not-requested","refChangeKind":"updated"}'::jsonb
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE source_events
      DROP COLUMN IF EXISTS change_set
    `.execute(db);
  },
};
