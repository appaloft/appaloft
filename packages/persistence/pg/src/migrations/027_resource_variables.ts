import { type Kysely } from "kysely";

import { type Database } from "../schema";

export const resourceVariablesMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await db.schema
      .createTable("resource_variables")
      .ifNotExists()
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("resource_id", "text", (column) =>
        column.notNull().references("resources.id").onDelete("cascade"),
      )
      .addColumn("key", "text", (column) => column.notNull())
      .addColumn("value", "text", (column) => column.notNull())
      .addColumn("kind", "text", (column) => column.notNull())
      .addColumn("exposure", "text", (column) => column.notNull())
      .addColumn("scope", "text", (column) => column.notNull())
      .addColumn("is_secret", "boolean", (column) => column.notNull().defaultTo(false))
      .addColumn("updated_at", "timestamptz", (column) => column.notNull())
      .addUniqueConstraint("resource_variables_unique_identity", [
        "resource_id",
        "key",
        "exposure",
        "scope",
      ])
      .execute();
  },
  async down(db: Kysely<Database>): Promise<void> {
    await db.schema.dropTable("resource_variables").ifExists().execute();
  },
};
