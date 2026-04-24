import { type Kysely, sql } from "kysely";

export const serverLifecycleMigration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await sql`
      ALTER TABLE servers
      ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'active',
      ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
      ADD COLUMN IF NOT EXISTS deactivation_reason text
    `.execute(db);
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await sql`
      ALTER TABLE servers
      DROP COLUMN IF EXISTS deactivation_reason,
      DROP COLUMN IF EXISTS deactivated_at,
      DROP COLUMN IF EXISTS lifecycle_status
    `.execute(db);
  },
};
