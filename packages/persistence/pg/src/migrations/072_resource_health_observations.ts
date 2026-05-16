import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const resourceHealthObservationsMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS resource_health_observations (
        id TEXT PRIMARY KEY,
        resource_id TEXT NOT NULL,
        observed_at TIMESTAMPTZ NOT NULL,
        overall TEXT NOT NULL,
        runtime_lifecycle TEXT NOT NULL,
        runtime_health TEXT NOT NULL,
        public_access_status TEXT NOT NULL,
        proxy_status TEXT NOT NULL,
        health_policy_status TEXT NOT NULL,
        latest_deployment_id TEXT,
        summary JSONB NOT NULL,
        retained_until TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS resource_health_observations_resource_idx
      ON resource_health_observations (resource_id, observed_at DESC)
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS resource_health_observations_retained_until_idx
      ON resource_health_observations (retained_until)
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`DROP INDEX IF EXISTS resource_health_observations_retained_until_idx`.execute(db);
    await sql`DROP INDEX IF EXISTS resource_health_observations_resource_idx`.execute(db);
    await sql`DROP TABLE IF EXISTS resource_health_observations`.execute(db);
  },
};
