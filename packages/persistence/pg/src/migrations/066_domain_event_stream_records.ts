import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const domainEventStreamRecordsMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS domain_event_stream_records (
        id TEXT PRIMARY KEY,
        stream_scope TEXT NOT NULL,
        stream_id TEXT NOT NULL,
        cursor TEXT NOT NULL UNIQUE,
        occurred_at TIMESTAMPTZ NOT NULL,
        event_type TEXT NOT NULL,
        source_kind TEXT NOT NULL,
        aggregate_id TEXT,
        aggregate_type TEXT,
        deployment_id TEXT,
        correlation_id TEXT,
        causation_id TEXT,
        request_id TEXT,
        summary TEXT,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        guard_reason TEXT,
        created_at TIMESTAMPTZ NOT NULL
      )
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS domain_event_stream_records_stream_idx
      ON domain_event_stream_records (stream_scope, stream_id, occurred_at, id)
    `.execute(db);
    await sql`
      CREATE INDEX IF NOT EXISTS domain_event_stream_records_event_type_idx
      ON domain_event_stream_records (event_type, occurred_at)
    `.execute(db);
    await sql`
      CREATE INDEX IF NOT EXISTS domain_event_stream_records_aggregate_idx
      ON domain_event_stream_records (aggregate_type, aggregate_id, occurred_at)
    `.execute(db);
    await sql`
      CREATE INDEX IF NOT EXISTS domain_event_stream_records_deployment_idx
      ON domain_event_stream_records (deployment_id, occurred_at)
    `.execute(db);

    await sql`
      CREATE TABLE IF NOT EXISTS domain_event_stream_prune_watermarks (
        stream_scope TEXT NOT NULL,
        stream_id TEXT NOT NULL,
        pruned_before TIMESTAMPTZ NOT NULL,
        last_pruned_cursor TEXT,
        updated_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (stream_scope, stream_id)
      )
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`DROP TABLE IF EXISTS domain_event_stream_prune_watermarks`.execute(db);
    await sql`DROP INDEX IF EXISTS domain_event_stream_records_deployment_idx`.execute(db);
    await sql`DROP INDEX IF EXISTS domain_event_stream_records_aggregate_idx`.execute(db);
    await sql`DROP INDEX IF EXISTS domain_event_stream_records_event_type_idx`.execute(db);
    await sql`DROP INDEX IF EXISTS domain_event_stream_records_stream_idx`.execute(db);
    await sql`DROP TABLE IF EXISTS domain_event_stream_records`.execute(db);
  },
};
