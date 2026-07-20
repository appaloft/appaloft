import { type Kysely, sql } from "kysely";
import { type Database } from "../schema";

export const storageVolumeBackupPoliciesMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS storage_volume_backup_policies (
        id TEXT PRIMARY KEY,
        version TEXT NOT NULL,
        storage_volume_id TEXT NOT NULL,
        plan_request JSONB NOT NULL,
        scheduled_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        pre_deploy_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        schedule_interval_hours INTEGER NOT NULL,
        retry_on_failure BOOLEAN NOT NULL DEFAULT TRUE,
        failure_mode TEXT NOT NULL,
        notification_ref TEXT,
        last_run_at TIMESTAMPTZ,
        next_run_at TIMESTAMPTZ NOT NULL,
        claim_until TIMESTAMPTZ,
        last_trigger TEXT,
        last_status TEXT NOT NULL DEFAULT 'never',
        last_backup_id TEXT,
        last_process_attempt_id TEXT,
        last_pruned_count INTEGER NOT NULL DEFAULT 0,
        last_notification_status TEXT NOT NULL DEFAULT 'not-requested',
        last_error_code TEXT,
        updated_at TIMESTAMPTZ NOT NULL,
        CONSTRAINT storage_volume_backup_policies_failure_mode_chk CHECK (failure_mode IN ('block', 'continue')),
        CONSTRAINT storage_volume_backup_policies_last_status_chk CHECK (last_status IN ('never', 'succeeded', 'failed'))
      )
    `.execute(db);
    await sql`CREATE INDEX IF NOT EXISTS storage_volume_backup_policies_due_idx ON storage_volume_backup_policies (scheduled_enabled, next_run_at)`.execute(
      db,
    );
    await sql`CREATE INDEX IF NOT EXISTS storage_volume_backup_policies_volume_idx ON storage_volume_backup_policies (storage_volume_id, pre_deploy_enabled)`.execute(
      db,
    );
  },
  async down(db: Kysely<Database>): Promise<void> {
    await sql`DROP TABLE IF EXISTS storage_volume_backup_policies`.execute(db);
  },
};
