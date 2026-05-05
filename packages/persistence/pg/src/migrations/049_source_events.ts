import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const sourceEventsMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS source_events (
        id text PRIMARY KEY,
        project_id text,
        source_kind text NOT NULL,
        event_kind text NOT NULL,
        source_identity jsonb NOT NULL,
        ref text NOT NULL,
        revision text NOT NULL,
        delivery_id text,
        idempotency_key text,
        dedupe_key text NOT NULL,
        dedupe_status text NOT NULL,
        dedupe_of_source_event_id text REFERENCES source_events(id) ON DELETE SET NULL,
        verification jsonb NOT NULL,
        status text NOT NULL,
        matched_resource_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
        ignored_reasons text[] NOT NULL DEFAULT ARRAY[]::text[],
        policy_results jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_deployment_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
        received_at text NOT NULL
      )
    `.execute(db);

    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS source_events_dedupe_key_unique
      ON source_events (dedupe_key)
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS source_events_project_received_idx
      ON source_events (project_id, received_at DESC)
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS source_events_received_idx
      ON source_events (received_at DESC)
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      DROP INDEX IF EXISTS source_events_received_idx
    `.execute(db);

    await sql`
      DROP INDEX IF EXISTS source_events_project_received_idx
    `.execute(db);

    await sql`
      DROP INDEX IF EXISTS source_events_dedupe_key_unique
    `.execute(db);

    await sql`
      DROP TABLE IF EXISTS source_events
    `.execute(db);
  },
};
