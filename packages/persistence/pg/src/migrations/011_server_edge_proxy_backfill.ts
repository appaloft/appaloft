import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const serverEdgeProxyBackfillMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      UPDATE servers
      SET
        edge_proxy_kind = COALESCE(edge_proxy_kind, 'traefik'),
        edge_proxy_status = CASE
          WHEN COALESCE(edge_proxy_kind, 'traefik') = 'none' THEN 'disabled'
          ELSE COALESCE(edge_proxy_status, 'pending')
        END
      WHERE edge_proxy_kind IS NULL
        OR edge_proxy_status IS NULL
    `.execute(db);
  },

  async down(_db: Kysely<Database>): Promise<void> {},
};
