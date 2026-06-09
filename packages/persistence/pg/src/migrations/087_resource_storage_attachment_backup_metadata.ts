import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const resourceStorageAttachmentBackupMetadataMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE resource_storage_attachments
      ADD COLUMN data_format TEXT
    `.execute(db);

    await sql`
      ALTER TABLE resource_storage_attachments
      ADD COLUMN application_data_label TEXT
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE resource_storage_attachments
      DROP COLUMN IF EXISTS application_data_label
    `.execute(db);

    await sql`
      ALTER TABLE resource_storage_attachments
      DROP COLUMN IF EXISTS data_format
    `.execute(db);
  },
};
