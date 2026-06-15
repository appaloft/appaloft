import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const domainBindingResourceTargetsMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE domain_bindings
      ALTER COLUMN server_id DROP NOT NULL,
      ALTER COLUMN destination_id DROP NOT NULL
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      UPDATE domain_bindings
      SET status = 'deleted'
      WHERE server_id IS NULL OR destination_id IS NULL
    `.execute(db);
    await sql`
      DELETE FROM domain_bindings
      WHERE server_id IS NULL OR destination_id IS NULL
    `.execute(db);
    await sql`
      ALTER TABLE domain_bindings
      ALTER COLUMN server_id SET NOT NULL,
      ALTER COLUMN destination_id SET NOT NULL
    `.execute(db);
  },
};
