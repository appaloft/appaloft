import { type Kysely, sql } from "kysely";

export const serverDisplayOrderMigration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await sql`
      ALTER TABLE servers
      ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0
    `.execute(db);
    await sql`
      UPDATE servers
      SET display_order = ranked.display_order
      FROM (
        SELECT id, row_number() OVER (
          PARTITION BY organization_id
          ORDER BY created_at DESC, id ASC
        ) - 1 AS display_order
        FROM servers
        WHERE lifecycle_status != 'deleted'
      ) AS ranked
      WHERE servers.id = ranked.id
    `.execute(db);
    await sql`
      CREATE INDEX IF NOT EXISTS servers_display_order_idx
      ON servers (organization_id, lifecycle_status, display_order, created_at DESC)
    `.execute(db);
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await sql`DROP INDEX IF EXISTS servers_display_order_idx`.execute(db);
    await sql`ALTER TABLE servers DROP COLUMN IF EXISTS display_order`.execute(db);
  },
};
