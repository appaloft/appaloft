import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const previewPolicyQuotaExpiryMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE preview_policies
      ADD COLUMN IF NOT EXISTS max_active_previews INTEGER
    `.execute(db);

    await sql`
      ALTER TABLE preview_policies
      ADD COLUMN IF NOT EXISTS preview_ttl_hours INTEGER
    `.execute(db);

    await sql`
      ALTER TABLE preview_policy_decisions
      ADD COLUMN IF NOT EXISTS active_preview_count INTEGER NOT NULL DEFAULT 0
    `.execute(db);

    await sql`
      ALTER TABLE preview_policy_decisions
      ADD COLUMN IF NOT EXISTS max_active_previews INTEGER
    `.execute(db);

    await sql`
      ALTER TABLE preview_policy_decisions
      ADD COLUMN IF NOT EXISTS preview_expires_at TIMESTAMPTZ
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE preview_policy_decisions
      DROP COLUMN IF EXISTS preview_expires_at
    `.execute(db);

    await sql`
      ALTER TABLE preview_policy_decisions
      DROP COLUMN IF EXISTS max_active_previews
    `.execute(db);

    await sql`
      ALTER TABLE preview_policy_decisions
      DROP COLUMN IF EXISTS active_preview_count
    `.execute(db);

    await sql`
      ALTER TABLE preview_policies
      DROP COLUMN IF EXISTS preview_ttl_hours
    `.execute(db);

    await sql`
      ALTER TABLE preview_policies
      DROP COLUMN IF EXISTS max_active_previews
    `.execute(db);
  },
};
