import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const scheduledRuntimePrunePoliciesMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS scheduled_runtime_prune_policies (
        id TEXT PRIMARY KEY,
        version TEXT NOT NULL,
        scope TEXT NOT NULL,
        server_id TEXT NOT NULL,
        retention_days INTEGER NOT NULL,
        destructive BOOLEAN NOT NULL DEFAULT FALSE,
        categories JSONB NOT NULL,
        retry_on_failure BOOLEAN NOT NULL DEFAULT TRUE,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        updated_at TIMESTAMPTZ NOT NULL
      )
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS scheduled_runtime_prune_policies_server_idx
      ON scheduled_runtime_prune_policies (server_id, enabled)
    `.execute(db);
    await sql`
      CREATE INDEX IF NOT EXISTS scheduled_runtime_prune_policies_scope_idx
      ON scheduled_runtime_prune_policies (scope)
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`DROP INDEX IF EXISTS scheduled_runtime_prune_policies_scope_idx`.execute(db);
    await sql`DROP INDEX IF EXISTS scheduled_runtime_prune_policies_server_idx`.execute(db);
    await sql`DROP TABLE IF EXISTS scheduled_runtime_prune_policies`.execute(db);
  },
};
