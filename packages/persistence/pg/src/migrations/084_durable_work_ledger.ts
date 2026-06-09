import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const durableWorkLedgerMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS durable_work_items (
        id text PRIMARY KEY,
        kind text NOT NULL,
        status text NOT NULL,
        operation_key text NOT NULL,
        queue_backend text NOT NULL DEFAULT 'database',
        dedupe_key text,
        correlation_id text,
        request_id text,
        project_id text,
        environment_id text,
        resource_id text,
        deployment_id text,
        server_id text,
        subject_kind text,
        subject_id text,
        phase text,
        step text,
        priority integer NOT NULL DEFAULT 0,
        attempt_count integer NOT NULL DEFAULT 0,
        max_attempts integer NOT NULL DEFAULT 1,
        available_at text NOT NULL,
        lease_owner text,
        lease_expires_at text,
        started_at text,
        updated_at text NOT NULL,
        finished_at text,
        error_code text,
        error_category text,
        retriable boolean,
        safe_input jsonb NOT NULL DEFAULT '{}'::jsonb,
        safe_details jsonb NOT NULL DEFAULT '{}'::jsonb
      )
    `.execute(db);

    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS durable_work_items_dedupe_key_unique
      ON durable_work_items (dedupe_key)
      WHERE dedupe_key IS NOT NULL
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS durable_work_items_due_idx
      ON durable_work_items (status, available_at, priority DESC, updated_at)
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS durable_work_items_lease_idx
      ON durable_work_items (lease_owner, lease_expires_at)
      WHERE lease_owner IS NOT NULL
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS durable_work_items_related_idx
      ON durable_work_items (project_id, resource_id, deployment_id, server_id)
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS durable_work_items_subject_idx
      ON durable_work_items (subject_kind, subject_id)
      WHERE subject_kind IS NOT NULL AND subject_id IS NOT NULL
    `.execute(db);

    await sql`
      CREATE TABLE IF NOT EXISTS durable_work_events (
        id text PRIMARY KEY,
        work_item_id text NOT NULL REFERENCES durable_work_items(id) ON DELETE CASCADE,
        sequence integer NOT NULL,
        kind text NOT NULL,
        status text,
        phase text,
        step text,
        message text,
        worker_id text,
        worker_group text,
        occurred_at text NOT NULL,
        safe_details jsonb NOT NULL DEFAULT '{}'::jsonb,
        UNIQUE (work_item_id, sequence)
      )
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS durable_work_events_item_sequence_idx
      ON durable_work_events (work_item_id, sequence)
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS durable_work_events_occurred_idx
      ON durable_work_events (occurred_at DESC, id)
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`DROP INDEX IF EXISTS durable_work_events_occurred_idx`.execute(db);
    await sql`DROP INDEX IF EXISTS durable_work_events_item_sequence_idx`.execute(db);
    await sql`DROP TABLE IF EXISTS durable_work_events`.execute(db);
    await sql`DROP INDEX IF EXISTS durable_work_items_subject_idx`.execute(db);
    await sql`DROP INDEX IF EXISTS durable_work_items_related_idx`.execute(db);
    await sql`DROP INDEX IF EXISTS durable_work_items_lease_idx`.execute(db);
    await sql`DROP INDEX IF EXISTS durable_work_items_due_idx`.execute(db);
    await sql`DROP INDEX IF EXISTS durable_work_items_dedupe_key_unique`.execute(db);
    await sql`DROP TABLE IF EXISTS durable_work_items`.execute(db);
  },
};
