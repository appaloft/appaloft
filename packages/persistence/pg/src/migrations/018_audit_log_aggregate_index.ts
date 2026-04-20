import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const auditLogAggregateIndexMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      CREATE INDEX IF NOT EXISTS audit_logs_aggregate_id_idx
      ON audit_logs (aggregate_id)
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      DROP INDEX IF EXISTS audit_logs_aggregate_id_idx
    `.execute(db);
  },
};
