import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const auditEventArchivesMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS audit_event_archives (
        id TEXT PRIMARY KEY,
        archive_schema_version TEXT NOT NULL,
        source_kind TEXT NOT NULL,
        aggregate_id TEXT,
        event_type TEXT,
        from_time TIMESTAMPTZ,
        to_time TIMESTAMPTZ,
        source JSONB NOT NULL,
        reason TEXT NOT NULL,
        item_count INTEGER NOT NULL,
        truncated BOOLEAN NOT NULL,
        content_digest TEXT NOT NULL,
        retain_source_rows BOOLEAN NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      )
    `.execute(db);

    await sql`
      CREATE TABLE IF NOT EXISTS audit_event_archive_items (
        archive_id TEXT NOT NULL REFERENCES audit_event_archives(id) ON DELETE CASCADE,
        audit_event_id TEXT NOT NULL,
        aggregate_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        item JSONB NOT NULL,
        PRIMARY KEY (archive_id, audit_event_id)
      )
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS audit_event_archives_created_at_idx
      ON audit_event_archives (created_at DESC, id)
    `.execute(db);
    await sql`
      CREATE INDEX IF NOT EXISTS audit_event_archives_aggregate_idx
      ON audit_event_archives (aggregate_id, created_at DESC)
    `.execute(db);
    await sql`
      CREATE INDEX IF NOT EXISTS audit_event_archives_event_type_idx
      ON audit_event_archives (event_type, created_at DESC)
    `.execute(db);
    await sql`
      CREATE INDEX IF NOT EXISTS audit_event_archive_items_audit_event_idx
      ON audit_event_archive_items (audit_event_id)
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`DROP INDEX IF EXISTS audit_event_archive_items_audit_event_idx`.execute(db);
    await sql`DROP INDEX IF EXISTS audit_event_archives_event_type_idx`.execute(db);
    await sql`DROP INDEX IF EXISTS audit_event_archives_aggregate_idx`.execute(db);
    await sql`DROP INDEX IF EXISTS audit_event_archives_created_at_idx`.execute(db);
    await sql`DROP TABLE IF EXISTS audit_event_archive_items`.execute(db);
    await sql`DROP TABLE IF EXISTS audit_event_archives`.execute(db);
  },
};
