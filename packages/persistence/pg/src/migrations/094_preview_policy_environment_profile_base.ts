import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const previewPolicyEnvironmentProfileBaseMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE preview_policies
      ADD COLUMN IF NOT EXISTS environment_profile_base_environment_id TEXT
    `.execute(db);

    await sql`
      ALTER TABLE preview_policy_decisions
      ADD COLUMN IF NOT EXISTS environment_profile_base_environment_id TEXT
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE preview_policy_decisions
      DROP COLUMN IF EXISTS environment_profile_base_environment_id
    `.execute(db);

    await sql`
      ALTER TABLE preview_policies
      DROP COLUMN IF EXISTS environment_profile_base_environment_id
    `.execute(db);
  },
};
