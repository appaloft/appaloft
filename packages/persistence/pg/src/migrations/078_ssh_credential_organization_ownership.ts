import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const sshCredentialOrganizationOwnershipMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE ssh_credentials
      ADD COLUMN IF NOT EXISTS organization_id text NOT NULL DEFAULT 'org_self_hosted'
    `.execute(db);

    await db.schema
      .createIndex("ssh_credentials_organization_id_idx")
      .ifNotExists()
      .on("ssh_credentials")
      .column("organization_id")
      .execute();
  },

  async down(db: Kysely<Database>): Promise<void> {
    await db.schema.dropIndex("ssh_credentials_organization_id_idx").ifExists().execute();

    await sql`
      ALTER TABLE ssh_credentials
      DROP COLUMN IF EXISTS organization_id
    `.execute(db);
  },
};
