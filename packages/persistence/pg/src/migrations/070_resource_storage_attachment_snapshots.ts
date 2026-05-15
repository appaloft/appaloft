import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const resourceStorageAttachmentSnapshotsMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE resource_storage_attachments
      ADD COLUMN storage_volume_kind TEXT NOT NULL DEFAULT 'named-volume'
    `.execute(db);

    await sql`
      ALTER TABLE resource_storage_attachments
      ADD COLUMN source_path TEXT
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE resource_storage_attachments
      DROP COLUMN IF EXISTS source_path
    `.execute(db);

    await sql`
      ALTER TABLE resource_storage_attachments
      DROP COLUMN IF EXISTS storage_volume_kind
    `.execute(db);
  },
};
