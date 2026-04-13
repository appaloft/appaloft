import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const serverCredentialsMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE servers
      ADD COLUMN IF NOT EXISTS credential_kind text
    `.execute(db);

    await sql`
      ALTER TABLE servers
      ADD COLUMN IF NOT EXISTS credential_username text
    `.execute(db);

    await sql`
      ALTER TABLE servers
      ADD COLUMN IF NOT EXISTS credential_public_key text
    `.execute(db);

    await sql`
      ALTER TABLE servers
      ADD COLUMN IF NOT EXISTS credential_private_key text
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE servers
      DROP COLUMN IF EXISTS credential_private_key
    `.execute(db);

    await sql`
      ALTER TABLE servers
      DROP COLUMN IF EXISTS credential_public_key
    `.execute(db);

    await sql`
      ALTER TABLE servers
      DROP COLUMN IF EXISTS credential_username
    `.execute(db);

    await sql`
      ALTER TABLE servers
      DROP COLUMN IF EXISTS credential_kind
    `.execute(db);
  },
};
