import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const resourceRuntimeControlAttemptsMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS resource_runtime_control_attempts (
        id text PRIMARY KEY,
        resource_id text NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
        deployment_id text REFERENCES deployments(id) ON DELETE SET NULL,
        server_id text NOT NULL,
        destination_id text NOT NULL,
        operation text NOT NULL,
        status text NOT NULL,
        runtime_state text NOT NULL,
        blocked_reason text,
        error_code text,
        phases jsonb NOT NULL DEFAULT '[]'::jsonb,
        reason text,
        idempotency_key text,
        started_at text NOT NULL,
        completed_at text,
        updated_at text NOT NULL
      )
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS resource_runtime_control_attempts_resource_idx
      ON resource_runtime_control_attempts (resource_id, updated_at DESC)
    `.execute(db);

    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS resource_runtime_control_attempts_idempotency_unique
      ON resource_runtime_control_attempts (resource_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      DROP INDEX IF EXISTS resource_runtime_control_attempts_idempotency_unique
    `.execute(db);

    await sql`
      DROP INDEX IF EXISTS resource_runtime_control_attempts_resource_idx
    `.execute(db);

    await sql`
      DROP TABLE IF EXISTS resource_runtime_control_attempts
    `.execute(db);
  },
};
