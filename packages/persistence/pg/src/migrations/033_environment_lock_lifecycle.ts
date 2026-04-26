import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const environmentLockLifecycleMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE environments
      ADD COLUMN IF NOT EXISTS locked_at timestamptz,
      ADD COLUMN IF NOT EXISTS lock_reason text
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE environments
      DROP COLUMN IF EXISTS lock_reason,
      DROP COLUMN IF EXISTS locked_at
    `.execute(db);
  },
};
