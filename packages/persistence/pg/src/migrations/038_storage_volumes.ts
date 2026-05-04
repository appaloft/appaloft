import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const storageVolumesMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS storage_volumes (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        environment_id TEXT NOT NULL,
        name TEXT NOT NULL,
        slug TEXT NOT NULL,
        kind TEXT NOT NULL,
        source_path TEXT,
        description TEXT,
        backup_relationship JSONB,
        lifecycle_status TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        deleted_at TIMESTAMPTZ
      )
    `.execute(db);

    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS storage_volumes_environment_slug_active_idx
      ON storage_volumes (project_id, environment_id, slug)
      WHERE lifecycle_status != 'deleted'
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS storage_volumes_environment_idx
      ON storage_volumes (project_id, environment_id)
    `.execute(db);

    await sql`
      CREATE TABLE IF NOT EXISTS resource_storage_attachments (
        id TEXT PRIMARY KEY,
        resource_id TEXT NOT NULL,
        storage_volume_id TEXT NOT NULL REFERENCES storage_volumes(id),
        destination_path TEXT NOT NULL,
        mount_mode TEXT NOT NULL,
        attached_at TIMESTAMPTZ NOT NULL,
        UNIQUE (resource_id, destination_path)
      )
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS resource_storage_attachments_volume_idx
      ON resource_storage_attachments (storage_volume_id)
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      DROP TABLE IF EXISTS resource_storage_attachments
    `.execute(db);

    await sql`
      DROP TABLE IF EXISTS storage_volumes
    `.execute(db);
  },
};
