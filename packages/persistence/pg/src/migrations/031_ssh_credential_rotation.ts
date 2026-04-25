import { type Kysely, sql } from "kysely";

export const sshCredentialRotationMigration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await sql`
      ALTER TABLE ssh_credentials
      ADD COLUMN IF NOT EXISTS rotated_at timestamptz
    `.execute(db);
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await sql`
      ALTER TABLE ssh_credentials
      DROP COLUMN IF EXISTS rotated_at
    `.execute(db);
  },
};
