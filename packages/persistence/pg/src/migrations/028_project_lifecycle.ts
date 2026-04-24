import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const projectLifecycleMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE projects
      ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'active',
      ADD COLUMN IF NOT EXISTS archived_at timestamptz,
      ADD COLUMN IF NOT EXISTS archive_reason text
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE projects
      DROP COLUMN IF EXISTS archive_reason,
      DROP COLUMN IF EXISTS archived_at,
      DROP COLUMN IF EXISTS lifecycle_status
    `.execute(db);
  },
};
