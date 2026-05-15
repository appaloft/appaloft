import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const runtimeMonitoringSamplesMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS runtime_monitoring_samples (
        id TEXT PRIMARY KEY,
        observed_at TIMESTAMPTZ NOT NULL,
        collected_at TIMESTAMPTZ NOT NULL,
        scope_kind TEXT NOT NULL,
        scope_id TEXT NOT NULL,
        server_id TEXT,
        project_id TEXT,
        environment_id TEXT,
        resource_id TEXT,
        deployment_id TEXT,
        totals JSONB NOT NULL,
        freshness TEXT NOT NULL,
        partial BOOLEAN NOT NULL,
        labels JSONB NOT NULL,
        warnings JSONB NOT NULL,
        source_errors JSONB NOT NULL,
        retained_until TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS runtime_monitoring_samples_scope_idx
      ON runtime_monitoring_samples (scope_kind, scope_id, observed_at DESC)
    `.execute(db);
    await sql`
      CREATE INDEX IF NOT EXISTS runtime_monitoring_samples_server_idx
      ON runtime_monitoring_samples (server_id, observed_at DESC)
    `.execute(db);
    await sql`
      CREATE INDEX IF NOT EXISTS runtime_monitoring_samples_project_idx
      ON runtime_monitoring_samples (project_id, observed_at DESC)
    `.execute(db);
    await sql`
      CREATE INDEX IF NOT EXISTS runtime_monitoring_samples_environment_idx
      ON runtime_monitoring_samples (environment_id, observed_at DESC)
    `.execute(db);
    await sql`
      CREATE INDEX IF NOT EXISTS runtime_monitoring_samples_resource_idx
      ON runtime_monitoring_samples (resource_id, observed_at DESC)
    `.execute(db);
    await sql`
      CREATE INDEX IF NOT EXISTS runtime_monitoring_samples_deployment_idx
      ON runtime_monitoring_samples (deployment_id, observed_at DESC)
    `.execute(db);
    await sql`
      CREATE INDEX IF NOT EXISTS runtime_monitoring_samples_retained_until_idx
      ON runtime_monitoring_samples (retained_until)
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`DROP INDEX IF EXISTS runtime_monitoring_samples_retained_until_idx`.execute(db);
    await sql`DROP INDEX IF EXISTS runtime_monitoring_samples_deployment_idx`.execute(db);
    await sql`DROP INDEX IF EXISTS runtime_monitoring_samples_resource_idx`.execute(db);
    await sql`DROP INDEX IF EXISTS runtime_monitoring_samples_environment_idx`.execute(db);
    await sql`DROP INDEX IF EXISTS runtime_monitoring_samples_project_idx`.execute(db);
    await sql`DROP INDEX IF EXISTS runtime_monitoring_samples_server_idx`.execute(db);
    await sql`DROP INDEX IF EXISTS runtime_monitoring_samples_scope_idx`.execute(db);
    await sql`DROP TABLE IF EXISTS runtime_monitoring_samples`.execute(db);
  },
};
