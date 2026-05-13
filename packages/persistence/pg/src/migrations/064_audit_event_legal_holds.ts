import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const auditEventLegalHoldsMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS audit_event_legal_holds (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        aggregate_id TEXT,
        event_type TEXT,
        from_time TIMESTAMPTZ,
        to_time TIMESTAMPTZ,
        reason TEXT NOT NULL,
        requested_by TEXT,
        created_at TIMESTAMPTZ NOT NULL,
        released_at TIMESTAMPTZ,
        release_reason TEXT,
        released_by TEXT
      )
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS audit_event_legal_holds_status_idx
      ON audit_event_legal_holds (status, created_at)
    `.execute(db);
    await sql`
      CREATE INDEX IF NOT EXISTS audit_event_legal_holds_aggregate_idx
      ON audit_event_legal_holds (aggregate_id, status)
    `.execute(db);
    await sql`
      CREATE INDEX IF NOT EXISTS audit_event_legal_holds_window_idx
      ON audit_event_legal_holds (from_time, to_time, status)
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`DROP INDEX IF EXISTS audit_event_legal_holds_window_idx`.execute(db);
    await sql`DROP INDEX IF EXISTS audit_event_legal_holds_aggregate_idx`.execute(db);
    await sql`DROP INDEX IF EXISTS audit_event_legal_holds_status_idx`.execute(db);
    await sql`DROP TABLE IF EXISTS audit_event_legal_holds`.execute(db);
  },
};
