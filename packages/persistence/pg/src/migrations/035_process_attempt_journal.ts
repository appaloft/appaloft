import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const processAttemptJournalMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS process_attempt_journal (
        id text PRIMARY KEY,
        kind text NOT NULL,
        status text NOT NULL,
        operation_key text NOT NULL,
        dedupe_key text,
        correlation_id text,
        request_id text,
        phase text,
        step text,
        project_id text,
        resource_id text,
        deployment_id text,
        server_id text,
        domain_binding_id text,
        certificate_id text,
        started_at text,
        updated_at text NOT NULL,
        finished_at text,
        error_code text,
        error_category text,
        retriable boolean,
        next_eligible_at text,
        next_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
        safe_details jsonb NOT NULL DEFAULT '{}'::jsonb
      )
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS process_attempt_journal_kind_status_idx
      ON process_attempt_journal (kind, status, updated_at DESC)
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS process_attempt_journal_related_idx
      ON process_attempt_journal (resource_id, server_id, deployment_id)
    `.execute(db);

    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS process_attempt_journal_dedupe_key_unique
      ON process_attempt_journal (dedupe_key)
      WHERE dedupe_key IS NOT NULL
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      DROP INDEX IF EXISTS process_attempt_journal_dedupe_key_unique
    `.execute(db);

    await sql`
      DROP INDEX IF EXISTS process_attempt_journal_related_idx
    `.execute(db);

    await sql`
      DROP INDEX IF EXISTS process_attempt_journal_kind_status_idx
    `.execute(db);

    await sql`
      DROP TABLE IF EXISTS process_attempt_journal
    `.execute(db);
  },
};
