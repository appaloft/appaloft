import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const storageVolumeBackupsMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS storage_volume_backups (
        id TEXT PRIMARY KEY,
        storage_volume_id TEXT NOT NULL REFERENCES storage_volumes(id),
        project_id TEXT NOT NULL,
        environment_id TEXT NOT NULL,
        resource_id TEXT,
        storage_volume_kind TEXT NOT NULL,
        source_adapter_key TEXT NOT NULL,
        target_provider_key TEXT NOT NULL,
        target_ref TEXT NOT NULL,
        consistency TEXT NOT NULL,
        status TEXT NOT NULL,
        attempt_id TEXT NOT NULL,
        requested_at TIMESTAMPTZ NOT NULL,
        retention_status TEXT NOT NULL,
        local_only BOOLEAN NOT NULL DEFAULT TRUE,
        artifact_handle TEXT,
        size_bytes BIGINT,
        checksum TEXT,
        completed_at TIMESTAMPTZ,
        failed_at TIMESTAMPTZ,
        failure_code TEXT,
        failure_message TEXT,
        latest_restore_attempt JSONB,
        created_at TIMESTAMPTZ NOT NULL
      )
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS storage_volume_backups_volume_idx
      ON storage_volume_backups (storage_volume_id, created_at DESC)
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS storage_volume_backups_delete_blocker_idx
      ON storage_volume_backups (storage_volume_id, status, retention_status)
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      DROP TABLE IF EXISTS storage_volume_backups
    `.execute(db);
  },
};
