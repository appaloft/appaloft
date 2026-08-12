import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const workspaceActivationTargetEvidenceMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`ALTER TABLE workspace_open_entries
      ADD COLUMN IF NOT EXISTS target_class TEXT,
      ADD COLUMN IF NOT EXISTS target_selection_source TEXT,
      ADD COLUMN IF NOT EXISTS target_selection_reason TEXT,
      ADD COLUMN IF NOT EXISTS activation_repository_binding_id TEXT,
      ADD COLUMN IF NOT EXISTS activation_project_disposition TEXT,
      ADD COLUMN IF NOT EXISTS activation_repository_binding_disposition TEXT,
      ADD COLUMN IF NOT EXISTS activation_profile_disposition TEXT`.execute(db);
  },
  async down(db: Kysely<Database>): Promise<void> {
    await sql`ALTER TABLE workspace_open_entries
      DROP COLUMN IF EXISTS target_selection_reason,
      DROP COLUMN IF EXISTS target_selection_source,
      DROP COLUMN IF EXISTS target_class,
      DROP COLUMN IF EXISTS activation_profile_disposition,
      DROP COLUMN IF EXISTS activation_repository_binding_disposition,
      DROP COLUMN IF EXISTS activation_project_disposition,
      DROP COLUMN IF EXISTS activation_repository_binding_id`.execute(db);
  },
};
