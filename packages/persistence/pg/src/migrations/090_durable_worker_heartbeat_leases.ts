import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const durableWorkerHeartbeatLeasesMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE durable_worker_heartbeats
      ADD COLUMN IF NOT EXISTS lease_owner_id text
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS durable_worker_heartbeats_lease_owner_idx
      ON durable_worker_heartbeats (lease_owner_id)
      WHERE lease_owner_id IS NOT NULL
    `.execute(db);

    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS durable_worker_heartbeats_group_slot_idx
      ON durable_worker_heartbeats (worker_group, slot)
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`DROP INDEX IF EXISTS durable_worker_heartbeats_group_slot_idx`.execute(db);
    await sql`DROP INDEX IF EXISTS durable_worker_heartbeats_lease_owner_idx`.execute(db);
    await sql`
      ALTER TABLE durable_worker_heartbeats
      DROP COLUMN IF EXISTS lease_owner_id
    `.execute(db);
  },
};
