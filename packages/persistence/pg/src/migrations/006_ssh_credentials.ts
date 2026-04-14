import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const sshCredentialsMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await db.schema
      .createTable("ssh_credentials")
      .ifNotExists()
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("name", "text", (column) => column.notNull())
      .addColumn("kind", "text", (column) => column.notNull())
      .addColumn("username", "text")
      .addColumn("public_key", "text")
      .addColumn("private_key", "text", (column) => column.notNull())
      .addColumn("created_at", "timestamptz", (column) => column.notNull())
      .execute();

    await sql`
      ALTER TABLE servers
      ADD COLUMN IF NOT EXISTS credential_id text
    `.execute(db);

    await db.schema
      .alterTable("servers")
      .addForeignKeyConstraint(
        "servers_credential_id_fkey",
        ["credential_id"],
        "ssh_credentials",
        ["id"],
        (constraint) => constraint.onDelete("set null"),
      )
      .execute();
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE servers
      DROP CONSTRAINT IF EXISTS servers_credential_id_fkey
    `.execute(db);

    await sql`
      ALTER TABLE servers
      DROP COLUMN IF EXISTS credential_id
    `.execute(db);

    await db.schema.dropTable("ssh_credentials").ifExists().execute();
  },
};
