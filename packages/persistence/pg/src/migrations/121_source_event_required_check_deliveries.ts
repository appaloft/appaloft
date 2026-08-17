import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const sourceEventRequiredCheckDeliveriesMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`ALTER TABLE source_events
      ADD COLUMN IF NOT EXISTS check_gate_version INTEGER NOT NULL DEFAULT 0`.execute(db);
    await sql`CREATE TABLE IF NOT EXISTS source_event_check_deliveries (
      source_kind TEXT NOT NULL,
      delivery_id TEXT NOT NULL,
      source_identity JSONB NOT NULL,
      revision TEXT NOT NULL,
      check_name TEXT NOT NULL,
      check_run_id TEXT NOT NULL,
      conclusion TEXT NOT NULL,
      completed_at TIMESTAMPTZ NOT NULL,
      received_at TIMESTAMPTZ NOT NULL,
      processed_at TIMESTAMPTZ,
      PRIMARY KEY (source_kind, delivery_id)
    )`.execute(db);
    await sql`CREATE INDEX IF NOT EXISTS source_event_check_deliveries_revision_idx
      ON source_event_check_deliveries (source_kind, revision, received_at DESC)`.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`DROP TABLE IF EXISTS source_event_check_deliveries`.execute(db);
    await sql`ALTER TABLE source_events DROP COLUMN IF EXISTS check_gate_version`.execute(db);
  },
};
