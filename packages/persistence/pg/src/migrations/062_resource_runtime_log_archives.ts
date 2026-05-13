import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const resourceRuntimeLogArchivesMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS resource_runtime_log_archives (
        id TEXT PRIMARY KEY,
        resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE RESTRICT,
        deployment_id TEXT REFERENCES deployments(id) ON DELETE SET NULL,
        server_id TEXT REFERENCES servers(id) ON DELETE SET NULL,
        service_name TEXT,
        runtime_kind TEXT,
        captured_at TIMESTAMPTZ NOT NULL,
        reason TEXT,
        line_count INTEGER NOT NULL,
        retention_status TEXT NOT NULL,
        lines JSONB NOT NULL
      )
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS resource_runtime_log_archives_resource_idx
      ON resource_runtime_log_archives (resource_id, captured_at DESC)
    `.execute(db);
    await sql`
      CREATE INDEX IF NOT EXISTS resource_runtime_log_archives_deployment_idx
      ON resource_runtime_log_archives (deployment_id, captured_at DESC)
    `.execute(db);
    await sql`
      CREATE INDEX IF NOT EXISTS resource_runtime_log_archives_server_idx
      ON resource_runtime_log_archives (server_id, captured_at DESC)
    `.execute(db);
    await sql`
      CREATE INDEX IF NOT EXISTS resource_runtime_log_archives_captured_at_idx
      ON resource_runtime_log_archives (captured_at)
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`DROP INDEX IF EXISTS resource_runtime_log_archives_captured_at_idx`.execute(db);
    await sql`DROP INDEX IF EXISTS resource_runtime_log_archives_server_idx`.execute(db);
    await sql`DROP INDEX IF EXISTS resource_runtime_log_archives_deployment_idx`.execute(db);
    await sql`DROP INDEX IF EXISTS resource_runtime_log_archives_resource_idx`.execute(db);
    await sql`DROP TABLE IF EXISTS resource_runtime_log_archives`.execute(db);
  },
};
