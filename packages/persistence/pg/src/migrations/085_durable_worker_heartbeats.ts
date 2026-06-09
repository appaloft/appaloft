import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const durableWorkerHeartbeatsMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS durable_worker_heartbeats (
        worker_id text PRIMARY KEY,
        worker_group text NOT NULL,
        slot integer NOT NULL,
        mode text NOT NULL,
        queue_backend text NOT NULL,
        process_started_at text NOT NULL,
        last_seen_at text NOT NULL,
        status text NOT NULL
      )
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS durable_worker_heartbeats_group_seen_idx
      ON durable_worker_heartbeats (worker_group, last_seen_at DESC)
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS durable_worker_heartbeats_status_idx
      ON durable_worker_heartbeats (status, last_seen_at DESC)
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`DROP INDEX IF EXISTS durable_worker_heartbeats_status_idx`.execute(db);
    await sql`DROP INDEX IF EXISTS durable_worker_heartbeats_group_seen_idx`.execute(db);
    await sql`DROP TABLE IF EXISTS durable_worker_heartbeats`.execute(db);
  },
};
