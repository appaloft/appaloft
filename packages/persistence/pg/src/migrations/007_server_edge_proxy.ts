import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const serverEdgeProxyMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE servers
      ADD COLUMN IF NOT EXISTS edge_proxy_kind text
    `.execute(db);

    await sql`
      ALTER TABLE servers
      ADD COLUMN IF NOT EXISTS edge_proxy_status text
    `.execute(db);

    await sql`
      ALTER TABLE servers
      ADD COLUMN IF NOT EXISTS edge_proxy_last_attempt_at timestamptz
    `.execute(db);

    await sql`
      ALTER TABLE servers
      ADD COLUMN IF NOT EXISTS edge_proxy_last_succeeded_at timestamptz
    `.execute(db);

    await sql`
      ALTER TABLE servers
      ADD COLUMN IF NOT EXISTS edge_proxy_last_error_code text
    `.execute(db);

    await sql`
      ALTER TABLE servers
      ADD COLUMN IF NOT EXISTS edge_proxy_last_error_message text
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE servers
      DROP COLUMN IF EXISTS edge_proxy_last_error_message
    `.execute(db);

    await sql`
      ALTER TABLE servers
      DROP COLUMN IF EXISTS edge_proxy_last_error_code
    `.execute(db);

    await sql`
      ALTER TABLE servers
      DROP COLUMN IF EXISTS edge_proxy_last_succeeded_at
    `.execute(db);

    await sql`
      ALTER TABLE servers
      DROP COLUMN IF EXISTS edge_proxy_last_attempt_at
    `.execute(db);

    await sql`
      ALTER TABLE servers
      DROP COLUMN IF EXISTS edge_proxy_status
    `.execute(db);

    await sql`
      ALTER TABLE servers
      DROP COLUMN IF EXISTS edge_proxy_kind
    `.execute(db);
  },
};
