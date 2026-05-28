import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const authPendingVerificationIntentMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE "user"
      ADD COLUMN IF NOT EXISTS "appaloftPendingVerificationIntent" text
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE "user"
      DROP COLUMN IF EXISTS "appaloftPendingVerificationIntent"
    `.execute(db);
  },
};
