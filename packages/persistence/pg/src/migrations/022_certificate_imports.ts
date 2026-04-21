import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const certificateImportsMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE certificates
      ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'managed'
    `.execute(db);

    await sql`
      ALTER TABLE certificates
      ADD COLUMN IF NOT EXISTS safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    `.execute(db);

    await sql`
      ALTER TABLE certificates
      ADD COLUMN IF NOT EXISTS secret_refs jsonb NOT NULL DEFAULT '{}'::jsonb
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE certificates
      DROP COLUMN IF EXISTS secret_refs
    `.execute(db);

    await sql`
      ALTER TABLE certificates
      DROP COLUMN IF EXISTS safe_metadata
    `.execute(db);

    await sql`
      ALTER TABLE certificates
      DROP COLUMN IF EXISTS source
    `.execute(db);
  },
};
